import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
export default function CaseScene({ items = [], packed = [], hero = false }) {
  const ref = useRef(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let renderer, frame, observer;
    const scene = new THREE.Scene();
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      host.appendChild(renderer.domElement);
      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
      camera.position.set(7.5, 9, 10);
      camera.lookAt(0, 0, 0);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x425646, 3));
      const light = new THREE.DirectionalLight(0xffffff, 5);
      light.position.set(-4, 9, 5);
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      scene.add(light);
      const group = new THREE.Group();
      scene.add(group);
      const mat = (color, roughness = 0.6, metalness = 0.1) =>
        new THREE.MeshStandardMaterial({ color, roughness, metalness });
      const shell = mat(0x213d35),
        foam = mat(0x152923),
        metal = mat(0x9fafa2, 0.3, 0.7),
        black = mat(0x232827),
        lime = mat(0xd9f69b),
        glass = mat(0x3e817b, 0.15, 0.7);
      function box(w, h, d, m, x, y, z, parent = group) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
      }
      function cyl(r, h, m, x, y, z, parent = group) {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48), m);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        parent.add(mesh);
        return mesh;
      }
      box(6.4, 0.48, 4.4, shell, 0, -0.3, 0);
      box(6, 0.18, 4, foam, 0, 0, 0);
      box(0.18, 0.72, 4.4, shell, -3.15, 0.03, 0);
      box(0.18, 0.72, 4.4, shell, 3.15, 0.03, 0);
      box(6.4, 0.72, 0.18, shell, 0, 0.03, 2.15);
      box(6.4, 0.72, 0.18, shell, 0, 0.03, -2.15);
      const lid = new THREE.Group();
      lid.position.set(0, 0.05, -2.15);
      lid.rotation.x = -0.3;
      group.add(lid);
      box(6.4, 3.8, 0.22, shell, 0, 1.9, 0, lid);
      box(5.95, 3.3, 0.12, foam, 0, 1.9, 0.16, lid);
      for (let i = -2; i <= 2; i++)
        box(0.025, 3, 0.04, metal, i, 1.9, 0.24, lid);
      box(1.4, 0.16, 0.3, black, 0, -0.05, 2.5);
      for (const x of [-2, 2]) box(0.42, 0.5, 0.18, metal, x, 0.02, 2.3);
      const display = items.slice(0, 9);
      display.forEach((item, i) => {
        const x = -2 + (i % 3) * 2,
          z = -1.25 + Math.floor(i / 3) * 1.25;
        const ready = hero || packed.includes(item.id);
        box(1.75, 0.04, 1.06, ready ? foam : mat(0x385047), x, 0.13, z);
        if (!ready) {
          box(0.6, 0.025, 0.08, lime, x, 0.17, z);
          return;
        }
        const y = 0.36;
        switch (item.category) {
          case "Camera":
            box(1.12, 0.66, 0.6, black, x, y + 0.2, z);
            const lens = cyl(0.33, 0.4, black, x, y + 0.2, z + 0.35);
            lens.rotation.x = Math.PI / 2;
            const g = cyl(0.26, 0.02, glass, x, y + 0.2, z + 0.57);
            g.rotation.x = Math.PI / 2;
            box(0.35, 0.15, 0.25, black, x - 0.3, y + 0.6, z);
            break;
          case "Lens":
            cyl(0.34, 0.85, black, x, y + 0.24, z);
            cyl(0.29, 0.035, glass, x, y + 0.68, z);
            cyl(0.36, 0.07, metal, x, y + 0.15, z);
            break;
          case "Support":
            for (let k = -1; k <= 1; k++) {
              const b = box(0.13, 0.18, 1, metal, x + k * 0.22, y, z);
              b.rotation.y = k * 0.1;
            }
            break;
          case "Audio":
            box(0.8, 0.4, 0.65, black, x, y, z);
            box(0.08, 0.3, 0.08, black, x + 0.2, y + 0.35, z);
            box(0.2, 0.04, 0.15, lime, x, y + 0.22, z);
            break;
          case "Power":
            box(0.58, 0.5, 0.48, black, x - 0.28, y, z);
            box(0.58, 0.5, 0.48, black, x + 0.4, y, z);
            box(0.3, 0.025, 0.2, lime, x - 0.28, y + 0.26, z);
            break;
          case "Media":
            box(0.64, 0.08, 0.8, metal, x, y, z);
            box(0.5, 0.02, 0.36, lime, x, y + 0.05, z);
            break;
          default:
            box(0.8, 0.55, 0.7, black, x, y, z);
            cyl(0.36, 0.05, lime, x, y + 0.3, z);
        }
      });
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.ShadowMaterial({ opacity: 0.12 }),
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = -0.56;
      plane.receiveShadow = true;
      scene.add(plane);
      let tx = 0,
        ty = 0;
      const move = (e) => {
        const r = host.getBoundingClientRect();
        tx = ((e.clientX - r.left - r.width / 2) / r.width) * 0.22;
        ty = ((e.clientY - r.top - r.height / 2) / r.height) * 0.08;
      };
      host.addEventListener("pointermove", move);
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const resize = () => {
        camera.aspect = host.clientWidth / Math.max(host.clientHeight, 1);
        camera.updateProjectionMatrix();
        renderer.setSize(host.clientWidth, host.clientHeight);
      };
      observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();
      const render = () => {
        if (!reduce) {
          group.rotation.y += (tx - group.rotation.y) * 0.035;
          group.rotation.x += (ty - group.rotation.x) * 0.035;
        }
        renderer.render(scene, camera);
        frame = requestAnimationFrame(render);
      };
      render();
      return () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        host.removeEventListener("pointermove", move);
        scene.traverse((o) => {
          o.geometry?.dispose();
          if (o.material) o.material.dispose();
        });
        renderer.dispose();
        renderer.domElement.remove();
      };
    } catch {
      setFailed(true);
      renderer?.dispose();
    }
  }, [
    items.map((i) => i.id + ":" + i.category).join(","),
    packed.join(","),
    hero,
  ]);
  return (
    <div
      className="case-scene"
      ref={ref}
      role="img"
      aria-label={`Packing case: ${hero ? items.length : packed.length} of ${items.length} items packed`}
    >
      {failed && (
        <div className="scene-fallback">
          Your kit is ready for the checklist below.
          <br />
          3D preview is unavailable on this device.
        </div>
      )}
    </div>
  );
}
