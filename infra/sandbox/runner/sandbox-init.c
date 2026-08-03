#define _GNU_SOURCE
#include <errno.h>
#include <dirent.h>
#include <pthread.h>
#include <signal.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/ptrace.h>
#include <sys/resource.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

struct process_entry { pid_t pid; pid_t parent; int descendant; };
struct monitor_state { pid_t root; unsigned long limit; atomic_int done; atomic_int triggered; atomic_ulong maximum; };

static unsigned long descendants(pid_t root, pid_t *targets, size_t maximum_targets) {
  struct process_entry entries[8192]; size_t count = 0;
  DIR *directory = opendir("/proc"); if (directory == NULL) return 0;
  struct dirent *entry;
  while ((entry = readdir(directory)) != NULL && count < 8192) {
    char *end = NULL; long raw_pid = strtol(entry->d_name, &end, 10);
    if (end == entry->d_name || *end != '\0' || raw_pid <= 0) continue;
    char path[64]; if (snprintf(path, sizeof(path), "/proc/%ld/stat", raw_pid) < 0) continue;
    FILE *file = fopen(path, "r"); if (file == NULL) continue;
    char line[4096]; if (fgets(line, sizeof(line), file) == NULL) { fclose(file); continue; } fclose(file);
    char *suffix = strrchr(line, ')'); char state = 0; long parent = 0;
    if (suffix == NULL || sscanf(suffix + 2, "%c %ld", &state, &parent) != 2) continue;
    entries[count++] = (struct process_entry){ .pid = (pid_t)raw_pid, .parent = (pid_t)parent, .descendant = raw_pid == root };
  }
  closedir(directory);
  int changed = 1; while (changed) {
    changed = 0;
    for (size_t i = 0; i < count; i += 1) if (!entries[i].descendant) {
      for (size_t j = 0; j < count; j += 1) if (entries[j].descendant && entries[i].parent == entries[j].pid) {
        entries[i].descendant = 1; changed = 1; break;
      }
    }
  }
  unsigned long observed = 0;
  for (size_t i = 0; i < count; i += 1) if (entries[i].descendant) {
    if (targets != NULL && observed < maximum_targets) targets[observed] = entries[i].pid;
    observed += 1;
  }
  return observed;
}

static void *monitor_processes(void *raw) {
  struct monitor_state *state = raw; struct timespec interval = { .tv_sec = 0, .tv_nsec = 500000 };
  while (!atomic_load(&state->done)) {
    pid_t targets[512]; unsigned long observed = descendants(state->root, targets, 512);
    unsigned long prior = atomic_load(&state->maximum); while (observed > prior && !atomic_compare_exchange_weak(&state->maximum, &prior, observed)) {}
    if (observed > state->limit) {
      atomic_store(&state->triggered, 1);
      for (unsigned long index = 0; index < observed && index < 512; index += 1) if (targets[index] != getpid()) kill(targets[index], SIGKILL);
      break;
    }
    nanosleep(&interval, NULL);
  }
  return NULL;
}

static rlim_t bounded(const char *name, rlim_t minimum, rlim_t maximum) {
  const char *raw = getenv(name); char *end = NULL; errno = 0;
  unsigned long long value = raw == NULL ? 0 : strtoull(raw, &end, 10);
  if (errno != 0 || raw == NULL || end == raw || *end != '\0' || value < minimum || value > maximum) { fprintf(stderr, "sandbox_limit_invalid\n"); exit(125); }
  return (rlim_t)value;
}

static void limit(int resource, rlim_t value) {
  struct rlimit limits = { value, value }; if (setrlimit(resource, &limits) != 0) { fprintf(stderr, "sandbox_limit_unavailable\n"); _exit(125); }
}

int main(int argc, char **argv) {
  if (argc < 2) return 125;
  rlim_t processes = bounded("CLERVO_PROCESSES", 1, 256);
  rlim_t cpu_millis = bounded("CLERVO_CPU_MILLIS", 1, 300000);
  rlim_t file_bytes = bounded("CLERVO_FILE_BYTES", 1048576, 10737418240ULL);
  pid_t child = fork(); if (child < 0) return 125;
  if (child == 0) {
    if (setpgid(0, 0) != 0 || prctl(PR_SET_PDEATHSIG, SIGKILL) != 0 || ptrace(PTRACE_TRACEME, 0, NULL, NULL) != 0) _exit(125);
    if (raise(SIGSTOP) != 0) _exit(125);
    limit(RLIMIT_NPROC, processes); limit(RLIMIT_CPU, (cpu_millis + 999) / 1000); limit(RLIMIT_FSIZE, file_bytes); limit(RLIMIT_CORE, 0); limit(RLIMIT_NOFILE, 128);
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) _exit(125);
    execvp(argv[1], &argv[1]); _exit(errno == ENOENT ? 127 : 126);
  }
  int status = 0; if (waitpid(child, &status, 0) != child || !WIFSTOPPED(status)) return 125;
  long options = PTRACE_O_TRACEFORK | PTRACE_O_TRACEVFORK | PTRACE_O_TRACECLONE | PTRACE_O_TRACEEXEC | PTRACE_O_EXITKILL;
  if (ptrace(PTRACE_SETOPTIONS, child, NULL, options) != 0 || ptrace(PTRACE_CONT, child, NULL, NULL) != 0) return 125;

  struct monitor_state monitor = { .root = child, .limit = processes };
  atomic_init(&monitor.done, 0); atomic_init(&monitor.triggered, 0); atomic_init(&monitor.maximum, 1);
  pthread_t monitor_thread; if (pthread_create(&monitor_thread, NULL, monitor_processes, &monitor) != 0) return 125;

  unsigned long active = 1, maximum = 1; int root_status = 125; int process_limit_triggered = 0;
  while (active > 0) {
    pid_t observed = waitpid(-1, &status, __WALL); if (observed < 0) { if (errno == EINTR) continue; return 125; }
    if (WIFEXITED(status) || WIFSIGNALED(status)) {
      if (observed == child) root_status = WIFEXITED(status) ? WEXITSTATUS(status) : 128 + WTERMSIG(status);
      active -= 1; continue;
    }
    if (!WIFSTOPPED(status)) continue;
    unsigned int event = (unsigned int)status >> 16;
    if (event == PTRACE_EVENT_FORK || event == PTRACE_EVENT_VFORK || event == PTRACE_EVENT_CLONE) {
      unsigned long new_pid = 0;
      if (ptrace(PTRACE_GETEVENTMSG, observed, NULL, &new_pid) != 0 || new_pid == 0) return 125;
      active += 1; if (active > maximum) maximum = active;
      if (active > processes && !process_limit_triggered) {
        process_limit_triggered = 1;
        if (kill(-child, SIGKILL) != 0 && errno != ESRCH) return 125;
      }
      if (ptrace(PTRACE_CONT, observed, NULL, NULL) != 0 && errno != ESRCH) return 125;
      continue;
    }
    int signal = WSTOPSIG(status);
    int deliver = signal == SIGTRAP || signal == SIGSTOP ? 0 : signal;
    if (ptrace(PTRACE_CONT, observed, NULL, (void *)(intptr_t)deliver) != 0 && errno != ESRCH) return 125;
  }

  atomic_store(&monitor.done, 1); if (pthread_join(monitor_thread, NULL) != 0) return 125;
  unsigned long polled_maximum = atomic_load(&monitor.maximum); if (polled_maximum > maximum) maximum = polled_maximum;
  if (atomic_load(&monitor.triggered)) process_limit_triggered = 1;
  struct rusage usage; if (getrusage(RUSAGE_CHILDREN, &usage) != 0) return 125;
  long long cpu = (long long)usage.ru_utime.tv_sec * 1000 + usage.ru_utime.tv_usec / 1000 + (long long)usage.ru_stime.tv_sec * 1000 + usage.ru_stime.tv_usec / 1000;
  dprintf(3, "{\"cpuMillis\":%lld,\"maximumProcessesObserved\":%lu,\"processLimitTriggered\":%s}\n", cpu, maximum, process_limit_triggered ? "true" : "false");
  return root_status;
}
