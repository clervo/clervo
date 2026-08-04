import { Canvas, useLoader, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

function cloneWorld(source: THREE.Group): THREE.Group {
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

function CanonicalWorld() {
  const gltf = useLoader(GLTFLoader, '/assets/clervo-worlds.glb');
  const scene = useMemo(() => cloneWorld(gltf.scene), [gltf.scene]);
  const { camera, invalidate } = useThree();

  useEffect(() => {
    camera.position.set(8.8, 8.8, 12.6);
    camera.lookAt(0, -0.1, 0.4);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, invalidate]);

  return <primitive object={scene} scale={0.92} />;
}

export function WebGLWorlds() {
  return (
    <Canvas
      className="worlds-webgl"
      camera={{ fov: 39, near: 0.1, far: 60 }}
      dpr={[1, 1.35]}
      frameloop="demand"
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.9;
      }}
      fallback={null}
    >
      <ambientLight intensity={0.17} color="#dfe6e4" />
      <directionalLight position={[-6, 10, 8]} intensity={2.8} color="#e7f0ee" />
      <directionalLight position={[8, 2, -4]} intensity={1.1} color="#5e7772" />
      <CanonicalWorld />
    </Canvas>
  );
}
