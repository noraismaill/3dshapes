// --- Global Variables ---
let scene, camera, renderer, particles, geometry, material;
let videoElement, hands, cameraUtils;
const count = 10000;
let currentScale = 1;
let targetPositions = null; // Store target shape positions
let isMorphing = false;
let morphSpeed = 0.05; // Smoothness of transition (lower = smoother)

// --- Initialize Everything ---
window.addEventListener('DOMContentLoaded', () => {
    initThree();
    initHandTracking();
    setupUIListeners();
    animate();
});

// --- Initialize Three.js ---
function initThree() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Create Geometry
    geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const targetPos = new Float32Array(count * 3); // For morphing
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    // Store reference to target positions
    targetPositions = targetPos;

    // Create Material
    material = new THREE.PointsMaterial({
        size: 0.03,
        color: 0x00ffcc,
        transparent: true,
        blending: THREE.AdditiveBlending
    });

    particles = new THREE.Points(geometry, material);
    scene.add(particles);
    camera.position.z = 8; // Optimal distance to view centered shapes

    generateTemplate('heart'); // Default template
}

// --- Particle Shape Templates ---
function getShapePosition(type, i) {
    let x, y, z;
    const t = (i / count) * Math.PI * 2; // Deterministic angle based on particle index
    const u = ((i * 7919) % count) / count * Math.PI * 2; // Pseudo-random but consistent

    if (type === 'heart') {
        // Centered heart - adjusted to center at origin
        x = 16 * Math.pow(Math.sin(t), 3) / 10;
        y = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 10 - 0.5;
        z = Math.sin(t * 10) * 0.5;
    } else if (type === 'flower') {
        // Centered flower with symmetric petals
        const petals = 5;
        const r = 2.5 * Math.sin(petals * t);
        x = r * Math.cos(t);
        y = r * Math.sin(t);
        z = Math.sin(t * 6 + u * 3) * 0.8;
    } else if (type === 'saturn') {
        // Centered Saturn with rings around equator
        const isRing = ((i * 17) % 100) > 40;
        if (isRing) {
            const angle = t * 3;
            const radius = 3 + ((i * 13) % 100) / 100 * 2;
            x = Math.cos(angle) * radius;
            y = Math.sin(angle) * radius * 0.15; // Flat ring
            z = Math.sin(angle) * radius * 0.4;  // Tilted view
        } else {
            // Sphere centered at origin
            const theta = (i / count) * Math.PI * 2;
            const phi = Math.acos(2 * ((i * 7919) % count) / count - 1);
            const radius = 2.5;
            x = radius * Math.sin(phi) * Math.cos(theta);
            y = radius * Math.sin(phi) * Math.sin(theta);
            z = radius * Math.cos(phi);
        }
    } else if (type === 'fireworks') {
        // Centered explosive sphere
        const spread = 3.5 + Math.sin(t * 20) * 0.5;
        x = Math.sin(t) * Math.cos(u) * spread;
        y = Math.sin(t) * Math.sin(u) * spread;
        z = Math.cos(t) * spread;
    } else if (type === 'buddha') {
        // Centered meditating figure
        const isHead = ((i * 23) % 100) < 15; // 15% for head
        
        if (isHead) {
            // Head centered at origin
            const headTheta = t * 5;
            const headPhi = u;
            x = Math.sin(headPhi) * Math.cos(headTheta) * 0.6;
            y = Math.sin(headPhi) * Math.sin(headTheta) * 0.6 + 1.8;
            z = Math.cos(headPhi) * 0.6;
        } else {
            // Body in meditation pose - centered lotus position
            const bodyR = 1.8;
            x = Math.cos(t) * bodyR;
            y = -Math.abs(Math.sin(t * 2)) * 1.2 - 0.5;
            z = Math.cos(u) * bodyR * 0.6;
        }
    } else {
        // Default Sphere - perfectly centered
        const theta = (i / count) * Math.PI * 2;
        const phi = Math.acos(2 * ((i * 7919) % count) / count - 1);
        const radius = 2.5;
        x = radius * Math.sin(phi) * Math.cos(theta);
        y = radius * Math.sin(phi) * Math.sin(theta);
        z = radius * Math.cos(phi);
    }

    return { x, y, z };
}

function generateTemplate(type) {
    const positions = geometry.attributes.position.array;
    
    // Generate target positions
    for (let i = 0; i < count; i++) {
        const pos = getShapePosition(type, i);
        targetPositions[i * 3] = pos.x;
        targetPositions[i * 3 + 1] = pos.y;
        targetPositions[i * 3 + 2] = pos.z;
        
        // If not morphing, set directly
        if (!isMorphing) {
            positions[i * 3] = pos.x;
            positions[i * 3 + 1] = pos.y;
            positions[i * 3 + 2] = pos.z;
        }
    }
    
    geometry.attributes.position.needsUpdate = true;
}

// --- Hand Tracking Logic (MediaPipe) ---
function initHandTracking() {
    videoElement = document.getElementById('video');
    
    hands = new Hands({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
    });

    hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    hands.onResults((results) => {
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            // Simple Logic: Distance between thumb and index as scale
            const hand = results.multiHandLandmarks[0];
            const dist = Math.hypot(hand[4].x - hand[8].x, hand[4].y - hand[8].y);
            currentScale = THREE.MathUtils.lerp(currentScale, dist * 10, 0.1);
        }
    });

    cameraUtils = new Camera(videoElement, {
        onFrame: async () => { 
            await hands.send({ image: videoElement }); 
        },
        width: 640,
        height: 480
    });
    
    cameraUtils.start().catch(err => {
        console.error('Camera error:', err);
    });
}

// --- UI Listeners ---
function setupUIListeners() {
    document.getElementById('template').addEventListener('change', (e) => {
        isMorphing = true;
        generateTemplate(e.target.value);
        // Morph will happen in animate loop
    });
    
    document.getElementById('colorPicker').addEventListener('input', (e) => {
        material.color.set(e.target.value);
    });
}

            // --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);

    // Morph between current and target positions
    if (isMorphing && targetPositions) {
        const positions = geometry.attributes.position.array;
        let reachedTarget = true;
        
        for (let i = 0; i < count; i++) {
            const px = i * 3;
            const py = i * 3 + 1;
            const pz = i * 3 + 2;
            
            // Smooth interpolation (lerp)
            positions[px] = THREE.MathUtils.lerp(positions[px], targetPositions[px], morphSpeed);
            positions[py] = THREE.MathUtils.lerp(positions[py], targetPositions[py], morphSpeed);
            positions[pz] = THREE.MathUtils.lerp(positions[pz], targetPositions[pz], morphSpeed);
            
            // Check if close enough to target
            const dist = Math.abs(positions[px] - targetPositions[px]) +
                        Math.abs(positions[py] - targetPositions[py]) +
                        Math.abs(positions[pz] - targetPositions[pz]);
            
            if (dist > 0.01) reachedTarget = false;
        }
        
        positions.needsUpdate = true;
        
        // Stop morphing when close enough
        if (reachedTarget) {
            isMorphing = false;
        }
    }

    // Respond to gesture scale
    particles.scale.set(currentScale, currentScale, currentScale);
    particles.rotation.y += 0.01;

    renderer.render(scene, camera);
}