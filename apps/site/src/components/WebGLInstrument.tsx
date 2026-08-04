import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
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

const shellDistance: Record<ExperiencePhase, number> = {
  risk: 0.0,
  qualified: 0.52,
  approval: 0.76,
  verified: 1.04,
  receipt: 1.16,
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
  const shellLeft = useMemo(() => scene.getObjectByName('ShellPetalLeft'), [scene]);
  const shellRight = useMemo(() => scene.getObjectByName('ShellPetalRight'), [scene]);
  const receipt = useMemo(() => scene.getObjectByName('ReceiptWafer'), [scene]);
  const requestPort = useMemo(() => scene.getObjectByName('RequestPort'), [scene]);
  const outcomeLens = useMemo(() => scene.getObjectByName('OutcomeLens'), [scene]);
  const color = semanticColor[phase];
  const index = phaseIndex[phase];
  const { invalidate } = useThree();

  useEffect(() => invalidate(), [invalidate, phase]);

  useEffect(() => {
    if (!(aperture instanceof THREE.Mesh)) return;
    const materials = Array.isArray(aperture.material) ? aperture.material : [aperture.material];
    for (const value of materials) {
      if (!(value instanceof THREE.MeshStandardMaterial)) continue;
      value.color.set('#090b0b');
      value.emissive.set(color);
      value.emissiveIntensity = phase === 'verified' ? 0.35 : 1.5;
      value.needsUpdate = true;
    }
    invalidate();
  }, [aperture, color, invalidate, phase]);

  useEffect(() => {
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
      const material = object.material;
      if (object.name.startsWith('RouteCyan')) {
        material.emissive.set('#57d8e8');
        material.emissiveIntensity = index >= 1 ? 1.8 : 0;
      } else if (object.name.startsWith('RouteGold')) {
        material.emissive.set('#d6b86a');
        material.emissiveIntensity = index >= 3 ? 1.5 : 0;
      }
      material.needsUpdate = true;
    });
    for (const [object, value, intensity] of [
      [requestPort, '#ff4d52', phase === 'risk' ? 2.8 : 0.8],
      [outcomeLens, '#d6b86a', phase === 'receipt' ? 3.0 : index >= 3 ? 1.4 : 0],
    ] as const) {
      if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) continue;
      object.material.emissive.set(value);
      object.material.emissiveIntensity = intensity;
      object.material.needsUpdate = true;
    }
    invalidate();
  }, [index, invalidate, outcomeLens, phase, requestPort, scene]);

  useFrame((_, delta) => {
    if (assembly.current === null || aperture === undefined || receipt === undefined || shellLeft === undefined || shellRight === undefined) return;
    const targetY = index * 0.045 - 0.10;
    const targetX = index < 2 ? -0.04 : 0.025;
    assembly.current.rotation.y = THREE.MathUtils.damp(assembly.current.rotation.y, targetY, 3.8, delta);
    assembly.current.rotation.x = THREE.MathUtils.damp(assembly.current.rotation.x, targetX, 3.8, delta);
    shellLeft.position.x = THREE.MathUtils.damp(shellLeft.position.x, -shellDistance[phase], 4.8, delta);
    shellRight.position.x = THREE.MathUtils.damp(shellRight.position.x, shellDistance[phase], 4.8, delta);
    aperture.position.z = THREE.MathUtils.damp(aperture.position.z, phase === 'receipt' ? 0.24 : index * 0.04, 4.8, delta);
    receipt.position.x = THREE.MathUtils.damp(
      receipt.position.x,
      phase === 'receipt' ? 2.05 : 0.52,
      4.8,
      delta,
    );
    receipt.position.z = THREE.MathUtils.damp(
      receipt.position.z,
      phase === 'receipt' ? 0.50 : 0.40,
      4.8,
      delta,
    );
    const moving = Math.abs(shellLeft.position.x + shellDistance[phase]) > 0.001
      || Math.abs(shellRight.position.x - shellDistance[phase]) > 0.001
      || Math.abs(receipt.position.x - (phase === 'receipt' ? 2.05 : 0.52)) > 0.001;
    if (moving) invalidate();
  });

  return (
    <group ref={assembly} rotation={[-0.04, -0.10, 0]} scale={0.78}>
      <primitive object={scene} />
      <pointLight color={color} intensity={phase === 'verified' ? 3.5 : 5.5} distance={6} position={[0, 0, 1.7]} />
    </group>
  );
}

export function WebGLInstrument({ phase }: { phase: ExperiencePhase }) {
  return (
    <Canvas
      camera={{ position: [0, 0.15, 7.6], fov: 34, near: 0.1, far: 30 }}
      dpr={[1, 1.5]}
      frameloop="demand"
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.9;
      }}
      fallback={null}
    >
      <ambientLight intensity={0.16} color="#dfe6e4" />
      <directionalLight position={[-4, 5, 6]} intensity={3.0} color="#f4f7f6" />
      <directionalLight position={[5, -3, 2]} intensity={1.2} color="#66706e" />
      <CanonicalPrism phase={phase} />
    </Canvas>
  );
}
