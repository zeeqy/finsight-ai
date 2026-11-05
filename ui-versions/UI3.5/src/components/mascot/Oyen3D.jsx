import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { OYEN_EVENT } from '../../lib/oyen';

/**
 * The 3D Oyen (three.js). Model: public/models/oyen.glb, meshopt-compressed from the v6 Blender
 * export (3.2 MB -> 0.74 MB), with clips Idle (loop), Wave and Hop. "think" and "worry" are poses
 * layered on Idle in code (head tilt, lean), so the model needs no extra clips.
 *
 * - Plays Idle; waves once after loading (unless greet is false or reduced motion is on).
 * - Turns gently toward the pointer and leans a little as the page scrolls.
 * - Reacts to oyen(action) events from anywhere in the app (lib/oyen.js).
 * - Renders only while on screen and the tab is visible; frees all GPU memory on unmount.
 * Calls onReady() after the first frame so the wrapper can fade out the still image.
 */
const POSES = {
  // [head x (nod), head z (tilt), upper body x (lean)]; radians added on top of the Idle clip
  think: [-0.16, 0.22, -0.03],
  worry: [0.22, -0.08, 0.08],
};

export default function Oyen3D({ greet = true, onReady, onError, className = '' }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch (err) {
      onError?.(err);
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    // Sized by CSS; setSize(..., false) below only sets the drawing buffer
    Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%' });
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 50);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c4d8, 1.7));
    const key = new THREE.DirectionalLight(0xfff4e6, 2.3);
    key.position.set(-2, 3, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xcfe0ff, 1.4);
    rim.position.set(1.5, 2.5, -3);
    scene.add(rim);

    const pivot = new THREE.Group();
    scene.add(pivot);
    const actions = {};
    let mixer;
    let idle;
    let current = null;
    let head;
    let upper;
    let pose = null; // 'think' | 'worry' | null
    let lastPose = 'think'; // kept while the pose fades out
    let poseWeight = 0;
    let applied = [0, 0, 0];
    let disposed = false;
    let visible = true;
    let readySent = false;

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    const playOnce = (name) => {
      const a = actions[name];
      if (!a || a === current) return;
      a.reset();
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = false;
      a.fadeIn(0.2).play();
      (current || idle)?.fadeOut(0.2);
      current = a;
    };

    const react = (action) => {
      if (action === 'wave' || action === 'hop') {
        pose = null;
        if (!reduceMotion) playOnce(action === 'wave' ? 'Wave' : 'Hop');
      } else if (action === 'think' || action === 'worry') {
        pose = action;
      } else {
        pose = null;
      }
    };
    const onOyen = (e) => react(e.detail?.action);
    window.addEventListener(OYEN_EVENT, onOyen);

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(
      '/models/oyen.glb',
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        pivot.add(model);
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);
        camera.position.set(0, 0.02, ((size.y / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.12);
        camera.lookAt(0, 0, 0);
        head = model.getObjectByName('Cat5_HeadPivot');
        upper = model.getObjectByName('Cat5_Upper');

        mixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach((clip) => {
          actions[clip.name] = mixer.clipAction(clip);
        });
        idle = actions.Idle;
        idle?.play();
        mixer.addEventListener('finished', (e) => {
          e.action.fadeOut(0.3);
          idle?.reset().fadeIn(0.3).play();
          current = null;
        });
        if (greet && !reduceMotion) setTimeout(() => !disposed && playOnce('Wave'), 450);
      },
      undefined,
      (err) => onError?.(err)
    );

    const onClick = () => react(Math.random() < 0.5 ? 'wave' : 'hop');
    renderer.domElement.addEventListener('click', onClick);

    // Pointer and scroll only nudge him; reduced motion keeps him still
    let ty = 0;
    let tx = 0;
    let lean = 0;
    const onMove = (e) => {
      ty = (e.clientX / window.innerWidth - 0.5) * 0.7;
      tx = (e.clientY / window.innerHeight - 0.5) * 0.16;
    };
    const onScroll = () => {
      lean = Math.min(1, window.scrollY / 400) * 0.18;
    };
    if (!reduceMotion) {
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(mount);

    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.1);
      if (!visible || document.hidden) return;
      // Undo last frame's pose first: joints the clip does not animate would otherwise keep adding up
      if (head) {
        head.rotation.x -= applied[0];
        head.rotation.z -= applied[1];
      }
      if (upper) upper.rotation.x -= applied[2];
      if (mixer) mixer.update(dt);
      // Blend the think/worry pose in and out on top of whatever the clip set this frame
      if (pose) lastPose = pose;
      poseWeight += ((pose ? 1 : 0) - poseWeight) * Math.min(1, dt * 6);
      const p = POSES[lastPose];
      applied = p.map((v) => v * poseWeight);
      if (head) {
        head.rotation.x += applied[0];
        head.rotation.z += applied[1];
      }
      if (upper) upper.rotation.x += applied[2];
      pivot.rotation.y += (ty - pivot.rotation.y) * 0.07;
      pivot.rotation.x += (tx + lean - pivot.rotation.x) * 0.07;
      renderer.render(scene, camera);
      if (mixer && !readySent) {
        readySent = true;
        onReady?.();
      }
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener(OYEN_EVENT, onOyen);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', onScroll);
      renderer.domElement.removeEventListener('click', onClick);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) [].concat(o.material).forEach((mat) => mat.dispose());
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greet]);

  return <div ref={mountRef} className={`w-full h-full cursor-pointer ${className}`} aria-hidden="true" />;
}
