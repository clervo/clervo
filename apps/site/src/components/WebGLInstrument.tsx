import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import type { ExperiencePhase } from '../product';

const semanticColor: Record<ExperiencePhase, string> = {
  risk: '#ff4d52',
  qualified: '#57d8e8',
  approval: '#e0a84b',
  verified: '#f4f7f6',
  receipt: '#d6b86a',
};

const phaseIndex: Record<ExperiencePhase, number> = {
  risk: 0,
  qualified: 1,
  approval: 2,
  verified: 3,
  receipt: 4,
};

const apertureDepth: Record<ExperiencePhase, number> = {
  risk: 0.09,
  qualified: 0.20,
  approval: 0.32,
  verified: 0.43,
  receipt: 0.50,
};

function cloneCanonicalScene(source: THREE.Group): THREE.Group {
  const scene = source.clone(true);
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.material = Array.isArray(object.material)
      ? object.material.map((value) => value.clone())
      : object.material.clone();
  });
  return scene;
}

function CanonicalPrism({ phase }: { phase: ExperiencePhase }) {
  const gltf = useLoader(GLTFLoader, '/assets/clervo-prism.glb');
  const scene = useMemo(() => cloneCanonicalScene(gltf.scene), [gltf.scene]);
  const assembly = useRef<THREE.Group>(null);
  const aperture = useMemo(() => scene.getObjectByName('VerificationAperture'), [scene]);
  const receipt = useMemo(() => scene.getObjectByName('ReceiptWafer'), [scene]);
  const color = semanticColor[phase];
  const index = phaseIndex[phase];

  useEffect(() => {
    if (!(aperture instanceof THREE.Mesh)) return;
    const materials = Array.isArray(aperture.material) ? aperture.material : [aperture.material];
    for (const value of materials) {
      if (!(value instanceof THREE.MeshStandardMaterial)) continue;
      value.color.set('#090b0b');
      value.emissive.set(color);
      value.emissiveIntensity = phase === 'verified' ? 1.3 : 2.3;
      value.needsUpdate = true;
    }
  }, [aperture, color, phase]);

  useFrame((state, delta) => {
    if (assembly.current === null || aperture === undefined || receipt === undefined) return;
    const targetY = index * 0.075 - 0.15;
    const targetX = index < 2 ? -0.08 : 0.04;
    assembly.current.rotation.y = THREE.MathUtils.damp(assembly.current.rotation.y, targetY, 3.8, delta);
    assembly.current.rotation.x = THREE.MathUtils.damp(assembly.current.rotation.x, targetX, 3.8, delta);
    aperture.position.z = THREE.MathUtils.damp(
      aperture.position.z,
      apertureDepth[phase],
      4.8,
      delta,
    );
    receipt.position.x = THREE.MathUtils.damp(
      receipt.position.x,
      phase === 'receipt' ? 2.15 : 0.65,
      4.8,
      delta,
    );
    receipt.position.z = THREE.MathUtils.damp(
      receipt.position.z,
      phase === 'receipt' ? 0.56 : 0.12,
      4.8,
      delta,
    );
    assembly.current.position.y = Math.sin(state.clock.elapsedTime * 0.45) * 0.025;
  });

  return (
    <group ref={assembly} rotation={[-0.08, -0.15, 0]} scale={0.82}>
      <primitive object={scene} />
      <pointLight color={color} intensity={phase === 'verified' ? 6 : 8} distance={6} position={[0, 0, 1.7]} />
    </group>
  );
}

export function WebGLInstrument({ phase }: { phase: ExperiencePhase }) {
  return (
    <Canvas
      camera={{ position: [0, 0.15, 7.6], fov: 34, near: 0.1, far: 30 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      fallback={null}
    >
      <ambientLight intensity={0.38} color="#dfe6e4" />
      <directionalLight position={[-4, 5, 6]} intensity={3.4} color="#f4f7f6" />
      <directionalLight position={[5, -3, 2]} intensity={1.6} color="#66706e" />
      <CanonicalPrism phase={phase} />
    </Canvas>
  );
}
