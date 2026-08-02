#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const manifestPath = path.join(root, 'apps/site/media/canonical-media.v1.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

function invariant(condition, code) {
  if (!condition) throw new Error(code);
}

invariant(manifest.schemaVersion === 'clervo.canonical-media.v1', 'media_schema_invalid');
invariant(manifest.canonicalObject === 'CLERVO_PRISM_MASTER', 'media_identity_invalid');
invariant(manifest.blenderVersion === '5.2.0 LTS', 'media_blender_version_unpinned');
invariant(manifest.generatedMediaUsedAsProductProof === false, 'media_truth_boundary_missing');
invariant(Array.isArray(manifest.artifacts) && manifest.artifacts.length === 26, 'media_artifact_set_incomplete');

for (const artifact of manifest.artifacts) {
  const absolute = path.join(root, artifact.path);
  const value = await readFile(absolute);
  invariant((await stat(absolute)).size === artifact.sizeBytes, `media_size_changed:${artifact.path}`);
  invariant(
    createHash('sha256').update(value).digest('hex') === artifact.sha256,
    `media_hash_changed:${artifact.path}`,
  );
}

const glb = await readFile(path.join(root, manifest.runtimeAsset));
invariant(glb.toString('ascii', 0, 4) === 'glTF', 'media_glb_magic_invalid');
invariant(glb.readUInt32LE(4) === 2, 'media_glb_version_invalid');
const jsonLength = glb.readUInt32LE(12);
const document = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
const nodeNames = new Set(document.nodes?.map(({ name }) => name));
const animationNames = new Set(document.animations?.map(({ name }) => name));
for (const name of [
  'VerificationAperture',
  'ReceiptWafer',
  'EvidenceBackplate',
  'FrameRail_01',
  'FrameRail_02',
  'FrameRail_03',
  'FrameRail_04',
]) invariant(nodeNames.has(name), `media_node_missing:${name}`);
for (const name of manifest.actions) invariant(animationNames.has(name), `media_action_missing:${name}`);

for (const artifact of manifest.artifacts.filter(({ path: value }) => value.endsWith('.png'))) {
  const png = await readFile(path.join(root, artifact.path));
  invariant(png.toString('hex', 0, 8) === '89504e470d0a1a0a', `media_png_invalid:${artifact.path}`);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const portrait = artifact.path.includes('-portrait-');
  invariant(
    portrait ? width === 600 && height === 960 : width === 960 && height === 600,
    `media_dimensions_invalid:${artifact.path}`,
  );
}

const webpArtifacts = manifest.artifacts.filter(({ path: value }) => value.endsWith('.webp'));
invariant(webpArtifacts.length === 12, 'media_webp_set_incomplete');
for (const artifact of webpArtifacts) {
  const webp = await readFile(path.join(root, artifact.path));
  invariant(
    webp.toString('ascii', 0, 4) === 'RIFF' && webp.toString('ascii', 8, 12) === 'WEBP',
    `media_webp_invalid:${artifact.path}`,
  );
}

console.log(`canonical media: PASS (${manifest.artifacts.length} hashed artifacts, ${document.nodes.length} runtime nodes)`);
