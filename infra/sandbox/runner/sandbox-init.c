#define _GNU_SOURCE
#include <errno.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

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
    limit(RLIMIT_NPROC, processes); limit(RLIMIT_CPU, (cpu_millis + 999) / 1000); limit(RLIMIT_FSIZE, file_bytes); limit(RLIMIT_CORE, 0); limit(RLIMIT_NOFILE, 128);
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) _exit(125);
    execvp(argv[1], &argv[1]); _exit(errno == ENOENT ? 127 : 126);
  }
  struct rusage usage; int status = 0; if (wait4(child, &status, 0, &usage) < 0) return 125;
  long long cpu = (long long)usage.ru_utime.tv_sec * 1000 + usage.ru_utime.tv_usec / 1000 + (long long)usage.ru_stime.tv_sec * 1000 + usage.ru_stime.tv_usec / 1000;
  dprintf(3, "{\"cpuMillis\":%lld}\n", cpu);
  if (WIFEXITED(status)) return WEXITSTATUS(status);
  if (WIFSIGNALED(status)) return 128 + WTERMSIG(status);
  return 125;
}
