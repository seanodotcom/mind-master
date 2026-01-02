import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import {
    CANVAS_WIDTH, CANVAS_HEIGHT, COLORS, BOARD_ROWS, CODE_LENGTH
} from '../constants';
import { PegColor, RowData, GameMode } from '../types';

interface Props {
    mode: GameMode;
    rows: RowData[];
    currentRow: number;
    onPegClick: (row: number, col: number) => void;
    secret: PegColor[];
    showSecret: boolean;
    isAnimating: boolean;
    isShuffling: boolean; // NEW PROP
    gameWon: boolean;
    isMobile: boolean;
    isTouch: boolean;
}

// 3D Layout Constants
const BOARD_WIDTH = 14;
const BOARD_HEIGHT = 22;
const BOARD_DEPTH = 1;
const ROW_SPACING = 1.6;
const COL_SPACING = 1.8;
const PEG_RADIUS = 0.6;
const ROW_START_Y = -8; // Bottom row Y
const SECRET_Y = 9;

// Offset to visually center the pegs+feedback within the board
// Adjusted from -1.65 to -1.0 to better center the content (Pegs + Arrow + Feedback)
const CONTENT_X_OFFSET = -1.0;

const MastermindCanvas: React.FC<Props> = ({
    mode, rows, currentRow, onPegClick, secret, showSecret, isAnimating, isShuffling, gameWon, isMobile, isTouch
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    // Refs for Three.js objects to manage state between renders
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const pegsGroupRef = useRef<THREE.Group | null>(null);
    const boardGroupRef = useRef<THREE.Group | null>(null);
    const secretGroupRef = useRef<THREE.Group | null>(null);
    const arrowRef = useRef<THREE.Mesh | null>(null);
    const raycaster = useRef(new THREE.Raycaster());
    const mouse = useRef(new THREE.Vector2());
    const deviceTilt = useRef({ x: 0, y: 0 });
    const hasOrientation = useRef(false);
    const animationId = useRef<number>(0);
    const fireworksRef = useRef<any[]>([]); // Store active fireworks


    // State tracking for diffing
    const prevRows = useRef<RowData[]>(rows);
    const prevSecret = useRef<PegColor[]>(secret);

    // KEY FIX: Ref to hold the latest callback to avoid stale closures in event listeners
    const onPegClickRef = useRef(onPegClick);
    useEffect(() => {
        onPegClickRef.current = onPegClick;
    }, [onPegClick]);

    // Refs for Animation Loop to access latest state
    const currentRowRef = useRef(currentRow);
    const modeRef = useRef(mode);
    const gameWonRef = useRef(gameWon);
    const isMobileRef = useRef(isMobile);
    const isAnimatingRef = useRef(isAnimating);

    // Ref for fireworks duration
    const isFireworksActive = useRef(false);

    useEffect(() => {
        currentRowRef.current = currentRow;
        modeRef.current = mode;
        gameWonRef.current = gameWon;
        isMobileRef.current = isMobile;
        isAnimatingRef.current = isAnimating;
    }, [currentRow, mode, gameWon, isMobile, isAnimating]);

    useEffect(() => {
        const handleOrientation = (event: DeviceOrientationEvent) => {
            const { beta, gamma } = event;
            if (beta === null || gamma === null) return;
            hasOrientation.current = true;
            const x = -((Math.min(Math.max(beta, 0), 90) - 45) / 45);
            const y = -(Math.min(Math.max(gamma, -45), 45) / 45);
            deviceTilt.current = { x, y };
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        };

        window.addEventListener('deviceorientation', handleOrientation);
        window.addEventListener('mousemove', handleMouseMove);

        return () => {
            window.removeEventListener('deviceorientation', handleOrientation);
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, []);




    // Auto-stop fireworks after 4 seconds
    useEffect(() => {
        if (gameWon) {
            isFireworksActive.current = true;
            const timer = setTimeout(() => {
                isFireworksActive.current = false;
            }, 4000);
            return () => clearTimeout(timer);
        } else {
            isFireworksActive.current = false;
        }
    }, [gameWon]);

    // Helper: Create Text Texture for "?"
    const createTextTexture = (text: string) => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = 'transparent';
            ctx.fillRect(0, 0, 128, 128);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 80px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, 64, 64);
        }
        const tex = new THREE.CanvasTexture(canvas);
        return tex;
    };

    const questionTexture = useRef<THREE.Texture | null>(null);

    // Fireworks Spawner
    const spawnFirework = (scene: THREE.Scene) => {
        const x = (Math.random() - 0.5) * 10;
        const y = (Math.random() - 0.5) * 10;
        const z = (Math.random() - 0.5) * 5;
        const color = new THREE.Color().setHSL(Math.random(), 1, 0.5);

        const geometry = new THREE.BufferGeometry();
        const count = 100;
        const positions = new Float32Array(count * 3);
        const velocities = [];

        for (let i = 0; i < count; i++) {
            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const speed = 0.1 + Math.random() * 0.2;

            velocities.push({
                x: speed * Math.sin(phi) * Math.cos(theta),
                y: speed * Math.sin(phi) * Math.sin(theta),
                z: speed * Math.cos(phi)
            });
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            color: color,
            size: 0.3,
            transparent: true,
            opacity: 1
        });

        const points = new THREE.Points(geometry, material);
        scene.add(points);

        fireworksRef.current.push({
            mesh: points,
            velocities: velocities,
            life: 1.0 + Math.random() * 0.5
        });
    };

    useEffect(() => {
        if (!containerRef.current) return;
        questionTexture.current = createTextTexture('?');

        // --- INIT THREE.JS ---
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x111827);
        scene.fog = new THREE.FogExp2(0x111827, 0.02);

        // Initial dummy values, will be fixed by ResizeObserver immediately
        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
        camera.position.set(0, 0, 24);
        camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        // Style will be 100% via CSS, size set via ResizeObserver
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        renderer.domElement.style.objectFit = 'contain';

        containerRef.current.appendChild(renderer.domElement);

        sceneRef.current = scene;
        cameraRef.current = camera;
        rendererRef.current = renderer;

        // --- RESIZE OBSERVER ---
        const handleResize = (entries: ResizeObserverEntry[]) => {
            if (!entries[0] || !rendererRef.current || !cameraRef.current) return;

            const { width, height } = entries[0].contentRect;

            rendererRef.current.setSize(width, height, false); // false prevents style update
            cameraRef.current.aspect = width / height;
            cameraRef.current.updateProjectionMatrix();
        };

        const resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(containerRef.current);

        // --- LIGHTING ---
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(10, 20, 15);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        scene.add(dirLight);

        const backLight = new THREE.DirectionalLight(0x3B82F6, 0.5);
        backLight.position.set(-5, 5, -10);
        scene.add(backLight);

        // --- BOARD ---
        const boardGroup = new THREE.Group();
        boardGroupRef.current = boardGroup;
        scene.add(boardGroup);

        const boardGeo = new THREE.BoxGeometry(BOARD_WIDTH, BOARD_HEIGHT, BOARD_DEPTH);
        const boardMat = new THREE.MeshStandardMaterial({
            color: 0x1F2937,
            roughness: 0.4,
            metalness: 0.1
        });
        const boardMesh = new THREE.Mesh(boardGeo, boardMat);
        boardMesh.receiveShadow = true;
        boardGroup.add(boardMesh);

        const holeGeo = new THREE.CylinderGeometry(PEG_RADIUS, PEG_RADIUS, 0.1, 32);
        const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const targetMat = new THREE.MeshBasicMaterial({ visible: false });

        const createHoles = (y: number, rowIndex: number) => {
            const startX = -((CODE_LENGTH - 1) * COL_SPACING) / 2 + CONTENT_X_OFFSET;
            for (let i = 0; i < CODE_LENGTH; i++) {
                const x = startX + i * COL_SPACING;

                const hole = new THREE.Mesh(holeGeo, holeMat);
                hole.rotation.x = Math.PI / 2;
                hole.position.set(x, y, BOARD_DEPTH / 2 + 0.05);
                boardGroup.add(hole);

                const target = new THREE.Mesh(
                    new THREE.CylinderGeometry(PEG_RADIUS * 1.8, PEG_RADIUS * 1.8, 1.5, 16),
                    targetMat
                );
                target.rotation.x = Math.PI / 2;
                target.position.set(x, y, BOARD_DEPTH / 2 + 0.5);
                target.userData = { type: 'hole', row: rowIndex, col: i };
                boardGroup.add(target);
            }

            const fbStartX = startX + CODE_LENGTH * COL_SPACING + 1.0;
            const fbRadius = PEG_RADIUS * 0.4;
            const fbGeo = new THREE.CylinderGeometry(fbRadius, fbRadius, 0.1, 16);

            const fbOffsets = [
                { x: 0, y: 0.4 }, { x: 0.8, y: 0.4 },
                { x: 0, y: -0.4 }, { x: 0.8, y: -0.4 }
            ];
            fbOffsets.forEach(off => {
                const fbHole = new THREE.Mesh(fbGeo, holeMat);
                fbHole.rotation.x = Math.PI / 2;
                fbHole.position.set(fbStartX + off.x, y + off.y, BOARD_DEPTH / 2 + 0.05);
                boardGroup.add(fbHole);
            });
        };

        for (let r = 0; r < BOARD_ROWS; r++) {
            createHoles(ROW_START_Y + r * ROW_SPACING, r);
        }
        createHoles(SECRET_Y, -1);

        // --- ARROW INDICATOR ---
        const arrowGeo = new THREE.ConeGeometry(0.4, 1.0, 32);
        const arrowMat = new THREE.MeshStandardMaterial({
            color: 0xFACC15,
            emissive: 0xA16207,
            emissiveIntensity: 0.5,
            roughness: 0.2,
            metalness: 0.8
        });
        const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
        arrowMesh.rotation.z = -Math.PI / 2;
        // Adjusted Arrow X from -6.0 to -5.2 for better compactness with new centering
        arrowMesh.position.set(-5.2, ROW_START_Y, BOARD_DEPTH / 2 + 0.5);
        arrowMesh.visible = false;
        boardGroup.add(arrowMesh);
        arrowRef.current = arrowMesh;

        const pegsGroup = new THREE.Group();
        pegsGroupRef.current = pegsGroup;
        boardGroup.add(pegsGroup);

        const secretGroup = new THREE.Group();
        secretGroupRef.current = secretGroup;
        boardGroup.add(secretGroup);

        // --- INTERACTION LOGIC ---
        const attemptInteraction = (clientX: number, clientY: number) => {
            if (!cameraRef.current || !boardGroupRef.current || !containerRef.current) return;

            const rect = containerRef.current.getBoundingClientRect();
            const x = ((clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((clientY - rect.top) / rect.height) * 2 + 1;
            const coords = new THREE.Vector2(x, y);

            raycaster.current.setFromCamera(coords, cameraRef.current);

            const intersects = raycaster.current.intersectObjects(boardGroupRef.current.children, true);

            for (const intersect of intersects) {
                const data = intersect.object.userData;
                if (data && (data.type === 'hole' || data.isPeg)) {
                    onPegClickRef.current(data.row, data.col);
                    return;
                }
            }
        };

        const handleClick = (e: MouseEvent) => {
            attemptInteraction(e.clientX, e.clientY);
        };

        containerRef.current.addEventListener('click', handleClick);

        // --- ANIMATION LOOP ---
        const animate = () => {
            animationId.current = requestAnimationFrame(animate);

            if (rendererRef.current && sceneRef.current && cameraRef.current) {

                let targetCameraY = 0;
                let targetCameraZ = 24;

                if (isMobileRef.current) {
                    // Dynamic Zoom: Fit Width
                    // Fit the board width (14) plus a small margin (e.g., 1.5 units total) into the view
                    const aspect = cameraRef.current.aspect;
                    const desiredVisibleWidth = 15.5;
                    const fovRad = (cameraRef.current.fov * Math.PI) / 180;
                    // Distance required to see 'desiredVisibleWidth' units horizontally
                    const distForWidth = desiredVisibleWidth / (2 * Math.tan(fovRad / 2) * aspect);

                    targetCameraZ = Math.max(15, distForWidth);

                    if (modeRef.current === GameMode.SETUP_2P) {
                        targetCameraY = SECRET_Y;
                    } else if (modeRef.current === GameMode.GAME_OVER) {
                        targetCameraY = SECRET_Y - 3;
                    } else if (modeRef.current === GameMode.PLAYING) {
                        // If animating (shuffling), look at top. Else look at current row.
                        if (isAnimatingRef.current) {
                            targetCameraY = SECRET_Y;
                        } else {
                            targetCameraY = ROW_START_Y + currentRowRef.current * ROW_SPACING;
                        }
                    } else {
                        targetCameraY = 0;
                    }
                } else {
                    targetCameraY = 0;
                    targetCameraZ = 24;
                }

                // SMOOTHER PAN: Reduced interpolation factor from 0.1 to 0.04
                cameraRef.current.position.y += (targetCameraY - cameraRef.current.position.y) * 0.04;
                cameraRef.current.position.z += (targetCameraZ - cameraRef.current.position.z) * 0.04;
                cameraRef.current.lookAt(0, cameraRef.current.position.y, 0);

                if (boardGroupRef.current) {
                    let targetRotX = 0;
                    let targetRotY = 0;

                    if (hasOrientation.current) {
                        targetRotX = deviceTilt.current.x * 0.4;
                        targetRotY = deviceTilt.current.y * 0.4;
                    } else {
                        targetRotX = mouse.current.y * 0.2;
                        targetRotY = mouse.current.x * 0.2;
                    }

                    boardGroupRef.current.rotation.x += (targetRotX - boardGroupRef.current.rotation.x) * 0.1;
                    boardGroupRef.current.rotation.y += (targetRotY - boardGroupRef.current.rotation.y) * 0.1;
                }

                if (arrowRef.current) {
                    const currentMode = modeRef.current;
                    const rowIdx = currentRowRef.current;

                    let targetY = ROW_START_Y + rowIdx * ROW_SPACING;
                    let targetVisible = currentMode === GameMode.PLAYING;

                    if (currentMode === GameMode.SETUP_2P) {
                        targetY = SECRET_Y;
                        targetVisible = true;
                    } else if (currentMode === GameMode.MENU) {
                        targetVisible = false;
                    } else if (currentMode === GameMode.GAME_OVER) {
                        targetVisible = false;
                    }

                    arrowRef.current.visible = targetVisible;
                    arrowRef.current.position.y += (targetY - arrowRef.current.position.y) * 0.15;
                    // Bobbing animation on X (Base now -5.2)
                    const time = Date.now() * 0.005;
                    arrowRef.current.position.x = -5.2 + Math.sin(time) * 0.15;
                }

                [pegsGroupRef.current, secretGroupRef.current].forEach(group => {
                    if (!group) return;
                    for (let i = group.children.length - 1; i >= 0; i--) {
                        const child = group.children[i] as any;
                        if (child.userData.isFalling) {
                            const targetY = child.userData.targetY;
                            child.userData.velocity += 0.04;
                            child.position.y -= child.userData.velocity;
                            if (child.position.y <= targetY) {
                                child.position.y = targetY;
                                if (child.userData.velocity > 0.15) {
                                    child.userData.velocity *= -0.3;
                                    child.position.y = targetY + 0.01;
                                } else {
                                    child.userData.isFalling = false;
                                    child.userData.velocity = 0;
                                }
                            }
                        }
                        else if (child.userData.isFlyingUp) {
                            child.position.y += child.userData.velocity;
                            child.userData.velocity += 0.05;
                            if (child.position.y > 30) {
                                group.remove(child);
                                if (child.geometry) child.geometry.dispose();
                            }
                        }
                    }
                });

                if (isFireworksActive.current && Math.random() < 0.05) {
                    spawnFirework(sceneRef.current!);
                }

                fireworksRef.current.forEach((fw, idx) => {
                    fw.life -= 0.015;
                    const positions = fw.mesh.geometry.attributes.position.array;
                    for (let i = 0; i < fw.velocities.length; i++) {
                        fw.velocities[i].y -= 0.005;
                        positions[i * 3] += fw.velocities[i].x;
                        positions[i * 3 + 1] += fw.velocities[i].y;
                        positions[i * 3 + 2] += fw.velocities[i].z;
                    }
                    fw.mesh.geometry.attributes.position.needsUpdate = true;
                    fw.mesh.material.opacity = fw.life;

                    if (fw.life <= 0) {
                        sceneRef.current?.remove(fw.mesh);
                        fw.mesh.geometry.dispose();
                        fireworksRef.current.splice(idx, 1);
                    }
                });

                rendererRef.current.render(sceneRef.current, cameraRef.current);
            }
        };
        animate();

        return () => {
            if (resizeObserver && containerRef.current) {
                resizeObserver.disconnect();
            }
            if (containerRef.current) {
                containerRef.current.removeEventListener('click', handleClick);
                if (rendererRef.current) {
                    containerRef.current.removeChild(rendererRef.current.domElement);
                }
            }
            cancelAnimationFrame(animationId.current);
            renderer.dispose();
        };
    }, []);

    // --- SYNC STATE TO SCENE ---
    useEffect(() => {
        if (!pegsGroupRef.current || !secretGroupRef.current) return;

        // Helper to get or create peg
        const syncPegs = (
            group: THREE.Group,
            data: PegColor[],
            rowIndex: number,
            yPos: number,
            prevData: PegColor[],
            isSecret = false
        ) => {
            const startX = -((CODE_LENGTH - 1) * COL_SPACING) / 2 + CONTENT_X_OFFSET;

            data.forEach((color, colIndex) => {
                const pegName = `peg-${rowIndex}-${colIndex}`;
                let pegMesh = group.children.find(c => c.name === pegName) as THREE.Mesh;
                const targetX = startX + colIndex * COL_SPACING;
                const targetY = yPos; // Local Y in board space
                const targetZ = BOARD_DEPTH / 2 + PEG_RADIUS * 0.8;

                if ((color as any) === PegColor.EMPTY) {
                    if (pegMesh && !pegMesh.userData.isFlyingUp) {
                        pegMesh.userData.isFlyingUp = true;
                        pegMesh.userData.velocity = 0.5;
                        pegMesh.name = `debris-${pegName}-${Date.now()}`;
                    }
                    return;
                }

                if (pegMesh && pegMesh.userData.isFlyingUp) {
                    pegMesh.name = `debris-${pegName}-${Date.now()}`;
                    pegMesh = undefined;
                }

                if (!pegMesh) {
                    const geo = new THREE.SphereGeometry(PEG_RADIUS, 32, 32);
                    const mat = new THREE.MeshPhysicalMaterial({
                        color: new THREE.Color(color),
                        metalness: 0.1,
                        roughness: 0.2,
                        clearcoat: 0.5,
                        clearcoatRoughness: 0.1
                    });
                    pegMesh = new THREE.Mesh(geo, mat);
                    pegMesh.name = pegName;
                    pegMesh.userData = {
                        isPeg: true,
                        row: rowIndex,
                        col: colIndex,
                        targetY: targetY,
                        velocity: 0,
                        isFalling: true
                    };
                    pegMesh.castShadow = true;
                    pegMesh.receiveShadow = true;
                    pegMesh.position.set(targetX, targetY + 8, targetZ);
                    group.add(pegMesh);
                } else {
                    (pegMesh.material as THREE.MeshPhysicalMaterial).color.set(color);
                    pegMesh.userData.targetY = targetY;
                    if (!pegMesh.userData.isFalling) pegMesh.position.y = targetY;
                }
            });
        };

        rows.forEach((row, r) => {
            const y = ROW_START_Y + r * ROW_SPACING;
            syncPegs(pegsGroupRef.current!, row.pegs, r, y, prevRows.current[r]?.pegs || Array(4).fill(PegColor.EMPTY));

            const fbStartX = (-((CODE_LENGTH - 1) * COL_SPACING) / 2) + CONTENT_X_OFFSET + CODE_LENGTH * COL_SPACING + 1.0;
            const fbOffsets = [
                { x: 0, y: 0.4 }, { x: 0.8, y: 0.4 },
                { x: 0, y: -0.4 }, { x: 0.8, y: -0.4 }
            ];

            const totalPegs = (row.feedback?.black || 0) + (row.feedback?.white || 0);

            for (let i = 0; i < 4; i++) {
                const fbName = `fb-${r}-${i}`;
                let fbMesh = pegsGroupRef.current!.children.find(c => c.name === fbName) as THREE.Mesh;

                if (i < totalPegs) {
                    const isBlack = i < (row.feedback?.black || 0);
                    const color = isBlack ? 0xDC2626 : 0xFFFFFF;
                    const off = fbOffsets[i];
                    const targetY = y + off.y;

                    if (fbMesh && fbMesh.userData.isFlyingUp) {
                        fbMesh.name = `debris-${fbName}-${Date.now()}`;
                        fbMesh = undefined;
                    }

                    if (!fbMesh) {
                        const fbGeo = new THREE.SphereGeometry(0.25, 16, 16);
                        const fbMat = new THREE.MeshStandardMaterial({ color });
                        fbMesh = new THREE.Mesh(fbGeo, fbMat);
                        fbMesh.name = fbName;
                        fbMesh.userData = {
                            targetY,
                            velocity: 0,
                            isFalling: true
                        };
                        fbMesh.position.set(fbStartX + off.x, targetY + 12, BOARD_DEPTH / 2 + 0.2);
                        pegsGroupRef.current!.add(fbMesh);
                    } else {
                        (fbMesh.material as THREE.MeshStandardMaterial).color.set(color);
                        if (!fbMesh.userData.isFalling) fbMesh.position.y = targetY;
                    }
                } else {
                    if (fbMesh && !fbMesh.userData.isFlyingUp) {
                        fbMesh.userData.isFlyingUp = true;
                        fbMesh.userData.velocity = 0.5 + Math.random() * 0.3;
                        fbMesh.name = `debris-${fbName}-${Date.now()}`;
                    }
                }
            }
        });

        while (secretGroupRef.current.children.length > 0) {
            secretGroupRef.current.remove(secretGroupRef.current.children[0]);
        }

        const secretY = SECRET_Y;
        const startX = -((CODE_LENGTH - 1) * COL_SPACING) / 2 + CONTENT_X_OFFSET;

        if (mode === GameMode.MENU) {
            // Do not render anything in secret group for menu
        } else if (showSecret || mode === GameMode.GAME_OVER || isShuffling) {
            secret.forEach((color, i) => {
                if ((color as any) === PegColor.EMPTY) return;
                const geo = new THREE.SphereGeometry(PEG_RADIUS, 32, 32);
                const mat = new THREE.MeshPhysicalMaterial({
                    color: new THREE.Color(color),
                    metalness: 0.1, roughness: 0.2, clearcoat: 0.5
                });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(startX + i * COL_SPACING, secretY, BOARD_DEPTH / 2 + PEG_RADIUS * 0.8);
                mesh.castShadow = true;

                secretGroupRef.current!.add(mesh);
            });
        } else {
            secret.forEach((_, i) => {
                // CHANGED: Use SphereGeometry to look like a "peg" instead of a box
                const geo = new THREE.SphereGeometry(PEG_RADIUS, 32, 32);
                // Dark gray material for the mystery peg
                const mat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.5, metalness: 0.1 });
                const mesh = new THREE.Mesh(geo, mat);

                // Same Z position as normal pegs to fit in hole
                mesh.position.set(startX + i * COL_SPACING, secretY, BOARD_DEPTH / 2 + PEG_RADIUS * 0.8);

                if (questionTexture.current) {
                    const spriteMat = new THREE.SpriteMaterial({ map: questionTexture.current, transparent: true });
                    const sprite = new THREE.Sprite(spriteMat);
                    sprite.scale.set(1.5, 1.5, 1);
                    // Float slightly in front of the sphere
                    sprite.position.z = 0.6;
                    mesh.add(sprite);
                }

                secretGroupRef.current!.add(mesh);
            });
        }

        prevRows.current = rows;
        prevSecret.current = secret;

    }, [rows, secret, showSecret, isAnimating, mode, isShuffling]);


    return (
        <div
            ref={containerRef}
            className="rounded-lg shadow-2xl overflow-hidden cursor-pointer bg-gray-900 border border-gray-800"
            style={{
                width: '100%',
                height: '100%',
                touchAction: 'pan-y'
            }}
        />
    );
};

export default MastermindCanvas;