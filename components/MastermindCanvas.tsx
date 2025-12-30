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
  gameWon: boolean;
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
const CONTENT_X_OFFSET = -1.65; 

const MastermindCanvas: React.FC<Props> = ({ 
  mode, rows, currentRow, onPegClick, secret, showSecret, isAnimating, gameWon 
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
  
  // Ref for fireworks duration
  const isFireworksActive = useRef(false);

  useEffect(() => {
    currentRowRef.current = currentRow;
    modeRef.current = mode;
    gameWonRef.current = gameWon;
  }, [currentRow, mode, gameWon]);

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
      
      for(let i=0; i<count; i++) {
          positions[i*3] = x;
          positions[i*3+1] = y;
          positions[i*3+2] = z;
          
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
    // Dark background matching the app
    scene.background = new THREE.Color(0x111827); 
    scene.fog = new THREE.FogExp2(0x111827, 0.02);

    const camera = new THREE.PerspectiveCamera(50, CANVAS_WIDTH / CANVAS_HEIGHT, 0.1, 100);
    camera.position.set(0, 0, 24);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    // --- LIGHTING ---
    // High ambient light to ensure pegs aren't too dark
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 15);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    // Rim light for definition
    const backLight = new THREE.DirectionalLight(0x3B82F6, 0.5);
    backLight.position.set(-5, 5, -10);
    scene.add(backLight);

    // --- BOARD ---
    const boardGroup = new THREE.Group();
    boardGroupRef.current = boardGroup;
    scene.add(boardGroup);

    // Main Board Body
    const boardGeo = new THREE.BoxGeometry(BOARD_WIDTH, BOARD_HEIGHT, BOARD_DEPTH);
    const boardMat = new THREE.MeshStandardMaterial({ 
      color: 0x1F2937, 
      roughness: 0.4, 
      metalness: 0.1 
    });
    const boardMesh = new THREE.Mesh(boardGeo, boardMat);
    boardMesh.receiveShadow = true;
    boardGroup.add(boardMesh);

    // Holes (Visual + Hit Targets)
    const holeGeo = new THREE.CylinderGeometry(PEG_RADIUS, PEG_RADIUS, 0.1, 32);
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000 }); // Pitch black holes
    const targetMat = new THREE.MeshBasicMaterial({ visible: false }); // Invisible targets for raycast

    const createHoles = (y: number, rowIndex: number) => {
      const startX = -((CODE_LENGTH - 1) * COL_SPACING) / 2 + CONTENT_X_OFFSET;
      for (let i = 0; i < CODE_LENGTH; i++) {
        const x = startX + i * COL_SPACING;
        
        // Visual Hole
        const hole = new THREE.Mesh(holeGeo, holeMat);
        hole.rotation.x = Math.PI / 2;
        hole.position.set(x, y, BOARD_DEPTH / 2 + 0.05);
        boardGroup.add(hole);

        // Hit Target (slightly larger for easier clicking)
        const target = new THREE.Mesh(new THREE.CylinderGeometry(PEG_RADIUS * 1.5, PEG_RADIUS * 1.5, 0.2, 16), targetMat);
        target.rotation.x = Math.PI / 2;
        target.position.set(x, y, BOARD_DEPTH / 2 + 0.1);
        target.userData = { type: 'hole', row: rowIndex, col: i };
        boardGroup.add(target);
      }

      // Feedback Holes
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

    // Generate Rows
    for (let r = 0; r < BOARD_ROWS; r++) {
      createHoles(ROW_START_Y + r * ROW_SPACING, r);
    }
    // Secret Row
    createHoles(SECRET_Y, -1);

    // --- ARROW INDICATOR ---
    const arrowGeo = new THREE.ConeGeometry(0.4, 1.0, 32);
    const arrowMat = new THREE.MeshStandardMaterial({ 
        color: 0xFACC15, // Yellow-400
        emissive: 0xA16207,
        emissiveIntensity: 0.5,
        roughness: 0.2,
        metalness: 0.8
    });
    const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
    arrowMesh.rotation.z = -Math.PI / 2; // Point right
    arrowMesh.position.set(-6.5, ROW_START_Y, BOARD_DEPTH/2 + 0.5);
    arrowMesh.visible = false;
    boardGroup.add(arrowMesh);
    arrowRef.current = arrowMesh;

    // --- PEGS CONTAINER ---
    const pegsGroup = new THREE.Group();
    pegsGroupRef.current = pegsGroup;
    boardGroup.add(pegsGroup);

    const secretGroup = new THREE.Group();
    secretGroupRef.current = secretGroup;
    boardGroup.add(secretGroup);

    // --- EVENT LISTENERS ---
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const handleClick = (e: MouseEvent) => {
       if (!cameraRef.current || !boardGroupRef.current) return;
       // Raycast
       raycaster.current.setFromCamera(mouse.current, cameraRef.current);
       
       // Recursive to hit pegs inside the group
       const intersects = raycaster.current.intersectObjects(boardGroupRef.current.children, true);
       
       for (const intersect of intersects) {
         const data = intersect.object.userData;
         if (data && (data.type === 'hole' || data.isPeg)) {
           // Use the ref to ensure we call the latest version of the handler
           onPegClickRef.current(data.row, data.col);
           return;
         }
       }
    };

    window.addEventListener('mousemove', handleMouseMove);
    containerRef.current.addEventListener('click', handleClick);

    // --- ANIMATION LOOP ---
    const animate = () => {
      animationId.current = requestAnimationFrame(animate);
      
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        // 1. Tilt Effect (Increased Sensitivity)
        if (boardGroupRef.current) {
          const targetRotX = mouse.current.y * 0.2; // Was 0.05
          const targetRotY = mouse.current.x * 0.2; // Was 0.05
          boardGroupRef.current.rotation.x += (targetRotX - boardGroupRef.current.rotation.x) * 0.1;
          boardGroupRef.current.rotation.y += (targetRotY - boardGroupRef.current.rotation.y) * 0.1;
        }

        // 2. Arrow Animation
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
            // Smooth lerp for Y position
            arrowRef.current.position.y += (targetY - arrowRef.current.position.y) * 0.15;
            
            // Bobbing animation on X
            const time = Date.now() * 0.005;
            // Base X is -6.5
            arrowRef.current.position.x = -6.5 + Math.sin(time) * 0.15; 
        }

        // 3. Animate Pegs (Physics Gravity & Fly Up)
        [pegsGroupRef.current, secretGroupRef.current].forEach(group => {
            if (!group) return;
            // Iterate backwards for safe removal
            for (let i = group.children.length - 1; i >= 0; i--) {
                const child = group.children[i] as any;
                
                // FALLING
                if (child.userData.isFalling) {
                    const targetY = child.userData.targetY;
                    
                    // Gravity physics
                    child.userData.velocity += 0.04; // Gravity acceleration
                    child.position.y -= child.userData.velocity;

                    // Floor check (Target Y)
                    if (child.position.y <= targetY) {
                        child.position.y = targetY;
                        
                        // Bounce logic
                        if (child.userData.velocity > 0.15) {
                            child.userData.velocity *= -0.3; // Less bounce for "heavy plastic" feel
                            child.position.y = targetY + 0.01; 
                        } else {
                            // Stop falling
                            child.userData.isFalling = false;
                            child.userData.velocity = 0;
                        }
                    }
                } 
                // FLYING UP (Removal)
                else if (child.userData.isFlyingUp) {
                    child.position.y += child.userData.velocity;
                    child.userData.velocity += 0.05; // Accelerate up
                    
                    if (child.position.y > 30) { // Off screen
                         group.remove(child);
                         if (child.geometry) child.geometry.dispose();
                    }
                }
            }
        });

        // 4. Fireworks Spawning (Use time-limited ref)
        if (isFireworksActive.current && Math.random() < 0.05) {
            spawnFirework(sceneRef.current!);
        }

        // 5. Update Fireworks
        fireworksRef.current.forEach((fw, idx) => {
            fw.life -= 0.015;
            const positions = fw.mesh.geometry.attributes.position.array;
            
            for(let i=0; i<fw.velocities.length; i++) {
                // Update velocity (gravity)
                fw.velocities[i].y -= 0.005;
                
                // Update position
                positions[i*3] += fw.velocities[i].x;
                positions[i*3+1] += fw.velocities[i].y;
                positions[i*3+2] += fw.velocities[i].z;
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
      window.removeEventListener('mousemove', handleMouseMove);
      if (containerRef.current) {
          containerRef.current.removeEventListener('click', handleClick);
          if (rendererRef.current) {
              containerRef.current.removeChild(rendererRef.current.domElement);
          }
      }
      cancelAnimationFrame(animationId.current);
      renderer.dispose();
    };
  }, []); // Init once

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

           // REMOVAL LOGIC: Fly Up
           if ((color as any) === PegColor.EMPTY) {
               if (pegMesh && !pegMesh.userData.isFlyingUp) {
                   pegMesh.userData.isFlyingUp = true;
                   pegMesh.userData.velocity = 0.5;
                   // Rename to debris so it doesn't conflict with future pegs
                   pegMesh.name = `debris-${pegName}-${Date.now()}`;
               }
               return;
           }

           // If there is debris occupying this name (unlikely due to rename) or we are refilling a slot that is currently flying away
           if (pegMesh && pegMesh.userData.isFlyingUp) {
                pegMesh.name = `debris-${pegName}-${Date.now()}`;
                pegMesh = undefined; // Force create new
           }

           if (!pegMesh) {
               // Create Peg
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
               
               // Start high
               pegMesh.position.set(targetX, targetY + 8, targetZ);

               group.add(pegMesh);
           } else {
               // Update Color
               (pegMesh.material as THREE.MeshPhysicalMaterial).color.set(color);
               pegMesh.userData.targetY = targetY;
               if (!pegMesh.userData.isFalling) pegMesh.position.y = targetY;
           }
       });
    };

    // Sync Guess Rows
    rows.forEach((row, r) => {
        const y = ROW_START_Y + r * ROW_SPACING;
        syncPegs(pegsGroupRef.current!, row.pegs, r, y, prevRows.current[r]?.pegs || Array(4).fill(PegColor.EMPTY));
        
        // Sync Feedback
        const fbStartX = (-((CODE_LENGTH - 1) * COL_SPACING) / 2) + CONTENT_X_OFFSET + CODE_LENGTH * COL_SPACING + 1.0;
        const fbOffsets = [
            { x: 0, y: 0.4 }, { x: 0.8, y: 0.4 },
            { x: 0, y: -0.4 }, { x: 0.8, y: -0.4 }
        ];
        
        // Calculate needed pegs
        const totalPegs = (row.feedback?.black || 0) + (row.feedback?.white || 0);

        // We check all 4 slots. If i < totalPegs, ensure it exists. If not, ensure it's removed.
        for(let i=0; i<4; i++) {
            const fbName = `fb-${r}-${i}`;
            let fbMesh = pegsGroupRef.current!.children.find(c => c.name === fbName) as THREE.Mesh;
            
            if (i < totalPegs) {
                 const isBlack = i < (row.feedback?.black || 0);
                 const color = isBlack ? 0xDC2626 : 0xFFFFFF;
                 const off = fbOffsets[i];
                 const targetY = y + off.y;

                 // If existing mesh is flying away, treat as gone
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
                     fbMesh.position.set(fbStartX + off.x, targetY + 12, BOARD_DEPTH/2 + 0.2); // Fall from high
                     pegsGroupRef.current!.add(fbMesh);
                 } else {
                     // Update existing
                     (fbMesh.material as THREE.MeshStandardMaterial).color.set(color);
                     if (!fbMesh.userData.isFalling) fbMesh.position.y = targetY;
                 }
            } else {
                // Should not exist - if it does, make it fly away
                if (fbMesh && !fbMesh.userData.isFlyingUp) {
                     fbMesh.userData.isFlyingUp = true;
                     fbMesh.userData.velocity = 0.5 + Math.random() * 0.3; // Random variance
                     fbMesh.name = `debris-${fbName}-${Date.now()}`;
                }
            }
        }
    });

    // Sync Secret Row
    while(secretGroupRef.current.children.length > 0){ 
        secretGroupRef.current.remove(secretGroupRef.current.children[0]); 
    }

    const secretY = SECRET_Y;
    const startX = -((CODE_LENGTH - 1) * COL_SPACING) / 2 + CONTENT_X_OFFSET;

    if (showSecret || mode === GameMode.GAME_OVER || isAnimating) {
         secret.forEach((color, i) => {
             // Cast to any to prevent TS error about non-overlapping types if inferred narrowly
             if ((color as any) === PegColor.EMPTY) return;
             const geo = new THREE.SphereGeometry(PEG_RADIUS, 32, 32);
             const mat = new THREE.MeshPhysicalMaterial({
                 color: new THREE.Color(color),
                 metalness: 0.1, roughness: 0.2, clearcoat: 0.5
             });
             const mesh = new THREE.Mesh(geo, mat);
             mesh.position.set(startX + i * COL_SPACING, secretY, BOARD_DEPTH/2 + PEG_RADIUS*0.8);
             mesh.castShadow = true;
             
             secretGroupRef.current!.add(mesh);
         });
    } else {
        // Show "?" Shields
        secret.forEach((_, i) => {
             const geo = new THREE.BoxGeometry(PEG_RADIUS * 1.8, PEG_RADIUS * 1.8, 0.5);
             const mat = new THREE.MeshStandardMaterial({ color: 0x374151 });
             const mesh = new THREE.Mesh(geo, mat);
             mesh.position.set(startX + i * COL_SPACING, secretY, BOARD_DEPTH/2 + 0.4);
             
             if (questionTexture.current) {
                 const spriteMat = new THREE.SpriteMaterial({ map: questionTexture.current, transparent: true });
                 const sprite = new THREE.Sprite(spriteMat);
                 sprite.scale.set(1.5, 1.5, 1);
                 sprite.position.z = 0.6; 
                 mesh.add(sprite);
             }
             
             secretGroupRef.current!.add(mesh);
        });
    }

    prevRows.current = rows;
    prevSecret.current = secret;

  }, [rows, secret, showSecret, isAnimating, mode]);


  return (
    <div 
      ref={containerRef} 
      className="rounded-lg shadow-2xl overflow-hidden cursor-pointer touch-none bg-gray-900 border border-gray-800"
      style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
    />
  );
};

export default MastermindCanvas;