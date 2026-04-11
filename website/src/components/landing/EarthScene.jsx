"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

function Earth() {
  const earthRef = useRef(null);
  const cloudRef = useRef(null);

  useFrame((_, delta) => {
    if (earthRef.current) {
      earthRef.current.rotation.y += delta * 0.2;
    }
    if (cloudRef.current) {
      cloudRef.current.rotation.y += delta * 0.14;
    }
  });

  return (
    <group>
      <mesh ref={earthRef}>
        <sphereGeometry args={[1.12, 64, 64]} />
        <meshStandardMaterial color="#0c121f" metalness={0.2} roughness={0.9} />
      </mesh>

      <mesh>
        <sphereGeometry args={[1.14, 48, 48]} />
        <meshBasicMaterial color="#3ee6c2" wireframe transparent opacity={0.24} />
      </mesh>

      <mesh ref={cloudRef}>
        <sphereGeometry args={[1.18, 40, 40]} />
        <meshBasicMaterial color="#9ff5df" transparent opacity={0.07} />
      </mesh>
    </group>
  );
}

function StarField() {
  const pointsRef = useRef(null);
  const stars = useMemo(() => {
    const amount = 1500;
    const positions = new Float32Array(amount * 3);

    for (let i = 0; i < amount; i += 1) {
      const radius = THREE.MathUtils.randFloat(4, 9);
      const theta = THREE.MathUtils.randFloatSpread(360);
      const phi = THREE.MathUtils.randFloatSpread(360);
      const x = radius * Math.sin(theta) * Math.cos(phi);
      const y = radius * Math.sin(theta) * Math.sin(phi);
      const z = radius * Math.cos(theta);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }

    return positions;
  }, []);

  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.012;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={stars.length / 3}
          array={stars}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial color="#69f0d0" size={0.02} sizeAttenuation />
    </points>
  );
}

export default function EarthScene() {
  return (
    <div className="relative h-[360px] w-full overflow-hidden rounded-3xl border border-white/10 bg-[#05080f] shadow-2xl shadow-black/50 sm:h-[460px]">
      <Canvas camera={{ position: [0, 0, 3.1], fov: 45 }}>
        <color attach="background" args={["#05080f"]} />
        <ambientLight intensity={0.45} />
        <directionalLight intensity={1.2} position={[2, 2, 2]} color="#80ffdf" />
        <directionalLight intensity={0.6} position={[-2, -1, -2]} color="#1f3759" />
        <Earth />
        <StarField />
        <OrbitControls
          enablePan={false}
          minDistance={2.4}
          maxDistance={4.2}
          autoRotate
          autoRotateSpeed={0.35}
        />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(62,230,194,0.15),transparent_38%),radial-gradient(circle_at_70%_70%,rgba(69,132,255,0.12),transparent_42%)]" />
    </div>
  );
}
