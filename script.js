// ================================================
// script.js - 3D Solenoid LC Circuit Simulation (Rectangular Layout)
// ================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { gsap } from "https://cdn.skypack.dev/gsap"; // For camera animations

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements --- (Same as before)
    const canvasContainer = document.getElementById('canvasContainer');
    const capacitanceSlider = document.getElementById('capacitance');
    // ... (rest of DOM elements are the same)
    const inductanceSlider = document.getElementById('inductance');
    const initialChargeSlider = document.getElementById('initialCharge');
    const simSpeedSlider = document.getElementById('simSpeed');
    const cValueSpan = document.getElementById('cValue');
    const lValueSpan = document.getElementById('lValue');
    const qValueSpan = document.getElementById('qValue');
    const speedValueSpan = document.getElementById('speedValue');
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    const resetButton = document.getElementById('resetButton');
    const timeDisplay = document.getElementById('timeDisplay');
    const currentDisplay = document.getElementById('currentDisplay');
    const chargeDisplay = document.getElementById('chargeDisplay');
    const didtDisplay = document.getElementById('didtDisplay');
    const vcDisplay = document.getElementById('vcDisplay');
    const vlDisplay = document.getElementById('vlDisplay');
    const energyCBar = document.getElementById('energyC');
    const energyLBar = document.getElementById('energyL');
    const energyTotalBar = document.getElementById('energyTotal');
    const energyCValueSpan = document.getElementById('energyCValue');
    const energyLValueSpan = document.getElementById('energyLValue');
    const energyTValueSpan = document.getElementById('energyTValue');
    const phaseInfoSpan = document.getElementById('phaseInfo');
    const chargeCurrentCtx = document.getElementById('chargeCurrentChart').getContext('2d');
    const energyCtx = document.getElementById('energyChart').getContext('2d');
    const camTopBtn = document.getElementById('camTop');
    const camSideBtn = document.getElementById('camSide');
    const camIsoBtn = document.getElementById('camIso');


    // --- Three.js Setup ---
    let scene, camera, renderer, controls;
    let solenoidWireMesh, capPlateLeft, capPlateRight;
    let chargeCarrierParticles;
    const chargeCarrierMaterial = new THREE.PointsMaterial({ color: 0xfd7e14, size: 0.08, sizeAttenuation: true });
    const eInducedArrowGroup = new THREE.Group();
    const eInducedArrows = [];
    let netBFieldArrow;
    let bFieldLabel, eInducedLabel;
    const bFieldMaterial = new THREE.MeshBasicMaterial({ color: 0x6f42c1, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const eInducedMaterial = new THREE.MeshBasicMaterial({ color: 0x17a2b8, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const arrowHelperLengthBase = 0.3;
    let wireGroup = new THREE.Group(); // Group for wire meshes

    // --- Physics Simulation Parameters --- (Same)
    let C = parseFloat(capacitanceSlider.value) * 1e-6; let L = parseFloat(inductanceSlider.value) * 1e-3; let Q0 = parseFloat(initialChargeSlider.value) * 1e-6; let simulationSpeedFactor = parseFloat(simSpeedSlider.value); const baseDt = 1.5e-7;

    // --- Physics Simulation State --- (Same)
    let t = 0, Q = Q0, I = 0, dIdt = 0, Vc = Q0 / C, Vl = 0; let simulationRunning = false; let animationFrameId = null; let maxEnergy = 0, period = 0;

    // --- Charting --- (Same)
    let chargeCurrentChart, energyChart; let timeData = [], chargeData = [], currentData = []; let energyCData = [], energyLData = [], totalEnergyData = []; const maxDataPoints = 800;

    // --- Visualization Parameters ---
    const numChargeCarriers = 160; const chargeCarrierSpeedScale = 5.0e7;
    // Geometry dimensions
    const solenoidRadius = 0.5; // Make solenoid smaller relative to layout
    const solenoidLength = 3.0; // Make solenoid shorter
    const numTurns = 8;
    const wireRadius = 0.04;
    const capPlateSize = 2.0; // Size of square capacitor plates
    const capThickness = 0.05;
    const capSeparation = 0.2;
    // Layout dimensions
    const rectWidth = solenoidLength + 2.0; // Width of the main wire rectangle
    const rectHeight = capPlateSize;      // Height matches capacitor

    let circuitPath; // Combined THREE.CurvePath object
    let chargeCarrierProgress = [];
    let pathLength = 0;
    let pathSegments = [];

    // ================================================
    // INITIALIZATION FUNCTIONS
    // ================================================

    function initThree() {
        // (Setup scene, camera, renderer, lights, controls)
        console.log("Initializing Three.js...");
        scene = new THREE.Scene(); scene.background = new THREE.Color(0xeef3f7);
        const aspect = canvasContainer.clientWidth / canvasContainer.clientHeight; camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
        // Adjust initial camera for rectangular layout
        camera.position.set(0, 3, rectWidth + 2); // View from front Z, slightly elevated
        camera.lookAt(0, 0, 0);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight); renderer.setPixelRatio(window.devicePixelRatio); canvasContainer.innerHTML = ''; canvasContainer.appendChild(renderer.domElement);
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); scene.add(ambientLight); const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); directionalLight.position.set(5, 10, 15); scene.add(directionalLight); // Adjust light position
        controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = 0.1; controls.target.set(0, 0, 0);

        createCircuitGeometryAndPath(); // Defines pathSegments correctly now
        createChargeCarrierParticles();
        createFieldArrowsAndLabels();

        scene.add(eInducedArrowGroup); // Add E-field group
        scene.add(wireGroup); // Add wire group

        window.addEventListener('resize', onWindowResize, false);
        console.log("Three.js Initialized.");
    }

    // *** REWORKED for Rectangular Layout ***
    function createCircuitGeometryAndPath() {
        console.log("Creating rectangular geometry and path...");
        // --- Cleanup ---
        if (solenoidWireMesh) scene.remove(solenoidWireMesh);
        if (capPlateLeft) scene.remove(capPlateLeft);
        if (capPlateRight) scene.remove(capPlateRight);
        scene.remove(wireGroup); // Remove old wire group
        wireGroup = new THREE.Group(); // Create new empty group

        // --- Materials ---
        const solenoidMaterial = new THREE.MeshStandardMaterial({ color: 0x566573, metalness: 0.4, roughness: 0.6, transparent: true, opacity:0.5 }); // Darker Solenoid
        const wireMaterial = new THREE.MeshStandardMaterial({ color: 0xabb2b9, metalness: 0.5, roughness: 0.5, transparent: true, opacity:0.5 }); // Grey Wire
        const plateMaterial = new THREE.MeshStandardMaterial({ color: 0xd5dbdb, metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide, transparent: true, opacity:0.5 }); // Lighter Plate

        // --- Capacitor Plates (On Left, YZ plane) ---
        const capCenterX = -rectWidth / 2 - 0.5; // Position capacitor center X
        const plateGeometry = new THREE.BoxGeometry(capThickness, capPlateSize, capPlateSize); // X is thickness
        capPlateLeft = new THREE.Mesh(plateGeometry, plateMaterial.clone()); // Left plate (Positive Q convention)
        capPlateRight = new THREE.Mesh(plateGeometry, plateMaterial.clone()); // Right plate
        capPlateLeft.position.set(capCenterX - capSeparation / 2, 0, 0);
        capPlateRight.position.set(capCenterX + capSeparation / 2, 0, 0);
        scene.add(capPlateLeft); scene.add(capPlateRight);
        // Define connection points (center of top/bottom edge)
        const capL_Top = new THREE.Vector3(capPlateLeft.position.x, rectHeight / 2, 0);
        const capL_Bottom = new THREE.Vector3(capPlateLeft.position.x, -rectHeight / 2, 0);
        const capR_Top = new THREE.Vector3(capPlateRight.position.x, rectHeight / 2, 0);
        const capR_Bottom = new THREE.Vector3(capPlateRight.position.x, -rectHeight / 2, 0);

        // --- Solenoid (Centered on Top Wire, Y = rectHeight/2) ---
        const solenoidCenterY = rectHeight / 2;
        const helixPoints = []; const turns = numTurns; const totalAngle = turns * 2 * Math.PI; const stepsPerTurn = 32; const helixSteps = turns * stepsPerTurn;
        for (let i = 0; i <= helixSteps; i++) {
             const t = i / helixSteps; const angle = t * totalAngle;
             const x = solenoidLength * (t - 0.5); // Centered on X=0
             // Helix around Y axis offset by solenoidCenterY
             const y = solenoidCenterY + solenoidRadius * Math.cos(angle);
             const z = solenoidRadius * Math.sin(angle); // Oscillates in Z
             helixPoints.push(new THREE.Vector3(x, y, z));
         }
        const helixCurve = new THREE.CatmullRomCurve3(helixPoints);
        const solenoidWireGeometry = new THREE.TubeGeometry(helixCurve, helixSteps, wireRadius, 8, false);
        solenoidWireMesh = new THREE.Mesh(solenoidWireGeometry, solenoidMaterial);
        scene.add(solenoidWireMesh);
        const solenoidStartPoint = helixCurve.getPointAt(0); // Left end of helix (X = -solenoidLength/2)
        const solenoidEndPoint = helixCurve.getPointAt(1);   // Right end of helix (X = solenoidLength/2)

        // --- Define Wire Corner Points for Rectangle ---
        const TL_Near = new THREE.Vector3(capR_Top.x + 0.1, rectHeight / 2, 0); // Just right of right plate, top
        const BL_Near = new THREE.Vector3(capL_Bottom.x, -rectHeight / 2, 0); // At left plate, bottom
        const TR_Far = new THREE.Vector3(rectWidth / 2, rectHeight / 2, 0);   // Top right corner
        const BR_Far = new THREE.Vector3(rectWidth / 2, -rectHeight / 2, 0);  // Bottom right corner

        // --- Create Individual Curve Segments (Conventional Current Path: L_Top -> R_Top -> TL_Near -> Sol_Start -> Sol_End -> TR_Far -> BR_Far -> BL_Near -> L_Bottom) ---
        // Note: We connect to the *correct* plates based on the Q definition
        const wire_LTop_RTop = new THREE.LineCurve3(capL_Top, capR_Top); // Conceptual link for positive Q leaving L plate
        const wire_RTop_TLNear = new THREE.LineCurve3(capR_Top, TL_Near); // From right plate to corner
        const wire_TLNear_SolStart = new THREE.LineCurve3(TL_Near, solenoidStartPoint);
        // Solenoid Helix (helixCurve)
        const wire_SolEnd_TRFar = new THREE.LineCurve3(solenoidEndPoint, TR_Far);
        const wire_TRFar_BRFar = new THREE.LineCurve3(TR_Far, BR_Far); // Right vertical
        const wire_BRFar_BLNear = new THREE.LineCurve3(BR_Far, BL_Near); // Bottom horizontal
        const wire_BLNear_LBottom = new THREE.LineCurve3(BL_Near, capL_Bottom); // Connect back to left plate bottom

        // --- Use CurvePath to Join Segments ---
        circuitPath = new THREE.CurvePath();
        // Add curves in order of conventional current flow
        circuitPath.add(wire_LTop_RTop); // Starts path
        circuitPath.add(wire_RTop_TLNear);
        circuitPath.add(wire_TLNear_SolStart);
        circuitPath.add(helixCurve); // Add the helix itself
        circuitPath.add(wire_SolEnd_TRFar);
        circuitPath.add(wire_TRFar_BRFar);
        circuitPath.add(wire_BRFar_BLNear);
        circuitPath.add(wire_BLNear_LBottom);
        // No need to closePath if start/end points match

        pathLength = circuitPath.getLength();
        console.log("Rectangular circuit path length:", pathLength);

        // --- Create Wire Meshes (Visuals) ---
        const wireTubeRadius = wireRadius * 0.8; const wireTubeSegments = 12; const wireRadialSegments = 6;
        // Add meshes for each *visible* wire segment
        wireGroup.add(new THREE.Mesh(new THREE.TubeGeometry(wire_RTop_TLNear, wireTubeSegments, wireTubeRadius, wireRadialSegments, false), wireMaterial));
        wireGroup.add(new THREE.Mesh(new THREE.TubeGeometry(wire_TLNear_SolStart, wireTubeSegments, wireTubeRadius, wireRadialSegments, false), wireMaterial));
        wireGroup.add(new THREE.Mesh(new THREE.TubeGeometry(wire_SolEnd_TRFar, wireTubeSegments, wireTubeRadius, wireRadialSegments, false), wireMaterial));
        wireGroup.add(new THREE.Mesh(new THREE.TubeGeometry(wire_TRFar_BRFar, wireTubeSegments, wireTubeRadius, wireRadialSegments, false), wireMaterial));
        wireGroup.add(new THREE.Mesh(new THREE.TubeGeometry(wire_BRFar_BLNear, wireTubeSegments, wireTubeRadius, wireRadialSegments, false), wireMaterial));
        wireGroup.add(new THREE.Mesh(new THREE.TubeGeometry(wire_BLNear_LBottom, wireTubeSegments, wireTubeRadius, wireRadialSegments, false), wireMaterial));

        // --- Define pathSegments for E-field placement ---
        pathSegments = []; let cumulativeLen = 0;
        circuitPath.curves.forEach((curve, index) => {
            const length = curve.getLength();
            let type = 'wire';
            if (curve === helixCurve) { type = 'solenoid'; }
            // Exclude the conceptual first segment if needed, although it has length zero usually
            if (curve !== wire_LTop_RTop || length > 1e-6 ) { // Check if it's the conceptual jump and has length
                 cumulativeLen += length;
                 pathSegments.push({ type, curve, length, cumulativeLength: cumulativeLen });
            }

        });
         // Re-calculate pathLength based on added segments if first one was skipped
         pathLength = cumulativeLen;
        console.log("Path segments defined. Final path length for particles:", pathLength);
    }

    function createChargeCarrierParticles() { /* (Same logic, uses new circuitPath) */
        console.log("Creating charge carrier particles..."); if (chargeCarrierParticles) scene.remove(chargeCarrierParticles); const particleGeometry = new THREE.BufferGeometry(); const positions = new Float32Array(numChargeCarriers * 3); chargeCarrierProgress = new Array(numChargeCarriers); if (!circuitPath || pathLength <= 0) { console.error("Path not ready for particles!"); return; } for (let i = 0; i < numChargeCarriers; i++) { chargeCarrierProgress[i] = Math.random(); try { const point = circuitPath.getPointAt(chargeCarrierProgress[i]); positions[i * 3] = point.x; positions[i * 3 + 1] = point.y; positions[i * 3 + 2] = point.z; } catch(e){ positions[i*3]=0;positions[i*3+1]=0;positions[i*3+2]=0;} } particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); chargeCarrierParticles = new THREE.Points(particleGeometry, chargeCarrierMaterial); scene.add(chargeCarrierParticles);
    }

    function createFieldArrowsAndLabels() { /* (Same logic, adjusts label positions) */
        console.log("Creating field arrows and labels..."); if (netBFieldArrow) scene.remove(netBFieldArrow); eInducedArrows.length = 0; while(eInducedArrowGroup.children.length > 0) eInducedArrowGroup.remove(eInducedArrowGroup.children[0]); if (bFieldLabel) scene.remove(bFieldLabel); if (eInducedLabel) scene.remove(eInducedLabel);
        const bArrowHeadLength = 0.3 * arrowHelperLengthBase; const bArrowHeadWidth = 0.2 * arrowHelperLengthBase; netBFieldArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, rectHeight / 2, 0), 0.1, bFieldMaterial.color.getHex(), bArrowHeadLength, bArrowHeadWidth); netBFieldArrow.visible = false; netBFieldArrow.line.material = bFieldMaterial.clone(); netBFieldArrow.cone.material = bFieldMaterial.clone(); scene.add(netBFieldArrow); // Add B arrow centered on solenoid Y
        const numEArrowsPerTurn = 4; const numEArrows = numTurns * numEArrowsPerTurn; const eArrowHeadLength = 0.1; const eArrowHeadWidth = 0.06; for(let i=0; i<numEArrows; i++) { const arrow = new THREE.ArrowHelper( new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), arrowHelperLengthBase * 0.8, eInducedMaterial.color.getHex(), eArrowHeadLength, eArrowHeadWidth); arrow.visible = false; arrow.line.material = eInducedMaterial.clone(); arrow.cone.material = eInducedMaterial.clone(); eInducedArrowGroup.add(arrow); eInducedArrows.push(arrow); }
        bFieldLabel = createLabelSprite("B", { fontsize: 14, textColor: { r: 111, g: 66, b: 193, a: 1.0 } }); bFieldLabel.position.set(0, rectHeight / 2 + solenoidRadius + 0.4, 0); bFieldLabel.visible = false; scene.add(bFieldLabel); // Position label above solenoid
        eInducedLabel = createLabelSprite("E_{ind}", { fontsize: 8, textColor: { r: 23, g: 162, b: 184, a: 1.0 } }); eInducedLabel.position.set(0, rectHeight / 2 - solenoidRadius - 0.4, 0); eInducedLabel.visible = false; scene.add(eInducedLabel); // Position label below solenoid
    }

    function createLabelSprite(message, parameters) { /* (Same helper function) */
        const fontface = parameters.fontface || 'Arial'; const fontsize = parameters.fontsize || 18; const borderThickness = parameters.borderThickness || 0; const borderColor = parameters.borderColor || { r:0, g:0, b:0, a:0.0 }; const backgroundColor = parameters.backgroundColor || { r:255, g:255, b:255, a:0.0 }; const textColor = parameters.textColor || { r:0, g:0, b:0, a:1.0 }; const canvas = document.createElement('canvas'); const context = canvas.getContext('2d'); context.font = `Bold ${fontsize}px ${fontface}`; const metrics = context.measureText(message); const textWidth = metrics.width; canvas.width = textWidth + borderThickness * 2; canvas.height = fontsize * 1.4 + borderThickness * 2; context.font = `Bold ${fontsize}px ${fontface}`; context.fillStyle = `rgba(${backgroundColor.r},${backgroundColor.g},${backgroundColor.b},${backgroundColor.a})`; context.strokeStyle = `rgba(${borderColor.r},${borderColor.g},${borderColor.b},${borderColor.a})`; context.lineWidth = borderThickness; context.fillStyle = `rgba(${textColor.r},${textColor.g},${textColor.b},${textColor.a})`; context.fillText(message, borderThickness, fontsize + borderThickness); const texture = new THREE.CanvasTexture(canvas); texture.needsUpdate = true; const spriteMaterial = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, sizeAttenuation: false }); const sprite = new THREE.Sprite(spriteMaterial); sprite.scale.set(0.01 * canvas.width, 0.01 * canvas.height, 1.0); return sprite;
    }

    function initializeCharts() { /* (Same) */
        console.log("Initializing charts..."); if (chargeCurrentChart) chargeCurrentChart.destroy(); if (energyChart) energyChart.destroy(); const commonOptions = { animation: {duration: 0}, responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { x: { type: 'linear', title: { display: true, text: 'Time (s)', font:{size: 10}}, ticks: { maxTicksLimit: 7, callback: value => value.toExponential(1), font:{size:9}}, min: 0 }, y: { beginAtZero: false, ticks:{font:{size:9}} } }, elements: { point: { radius: 0 }, line: { borderWidth: 1.5, tension: 0.1 } }, plugins: { legend: { display: true, labels: {boxWidth: 12, padding: 8, font: {size: 10}} } } }; chargeCurrentChart = new Chart(chargeCurrentCtx, { type: 'line', data: { labels: [], datasets: [ { label: 'Q (µC)', data: [], borderColor: '#5dade2', yAxisID: 'yQ' }, { label: 'I (mA)', data: [], borderColor: '#e74c3c', yAxisID: 'yI' } ]}, options: { ...commonOptions, plugins: {...commonOptions.plugins, title: {display: true, text: 'Charge & Current', font:{size: 12}} }, scales: { x: { ...commonOptions.scales.x }, yQ: { position: 'left', title: { display: true, text: 'Q', font:{size: 10}}}, yI: { position: 'right', title: { display: true, text: 'I', font:{size: 10}}, grid: { drawOnChartArea: false }} } } }); energyChart = new Chart(energyCtx, { type: 'line', data: { labels: [], datasets: [ { label: 'U E', data: [], borderColor: '#5dade2', backgroundColor: 'rgba(93, 173, 226, 0.1)', fill: 'origin', yAxisID: 'yEnergy' }, { label: 'U B', data: [], borderColor: '#e74c3c', backgroundColor: 'rgba(231, 76, 60, 0.1)', fill: 'origin', yAxisID: 'yEnergy' }, { label: 'U Tot', data: [], borderColor: '#af7ac5', borderDash: [4, 4], yAxisID: 'yEnergy' } ]}, options: { ...commonOptions, plugins: {...commonOptions.plugins, title: {display: true, text: 'Energy (µJ)', font:{size: 12}} }, scales: { x: { ...commonOptions.scales.x }, yEnergy: { position: 'left', title: { display: true, text: 'Energy', font:{size: 10}}, beginAtZero: true, suggestedMax: 1 } } } }); console.log("Charts initialized.");
    }


    // ================================================
    // UPDATE FUNCTIONS (Physics, Visuals, Info)
    // ================================================

    function updatePhysics(dt_step) { /* (Same physics logic) */
        Vc = Q / C; dIdt = Q / (L * C); Vl = -L * dIdt;
        const dQ = -I * dt_step; const dI = dIdt * dt_step;
        Q += dQ; I += dI; t += dt_step;
    }

    function updateVisuals() { /* (Same calls) */
        updateCapacitorVisuals(Q);
        updateFieldVisuals(I, dIdt);
    }

        // *** MODIFIED to HIDE particles ONLY in TOP capacitor gap ***
        function updateChargeCarrierPositionsSubStep(currentI, dt_step) {
            if (!chargeCarrierParticles || !chargeCarrierParticles.geometry || !circuitPath || pathLength <= 0) return;
   
            const chargeCarrierFlowSpeed = currentI; // Positive charge moves with I
            const progressDelta = (chargeCarrierFlowSpeed * chargeCarrierSpeedScale * dt_step) / pathLength;
   
            const positions = chargeCarrierParticles.geometry.attributes.position.array;
            const offscreen = new THREE.Vector3(1e5, 1e5, 1e5); // A position far away
   
            // Define the X-coordinates of the capacitor plates
            // Note: Capacitor is centered at capCenterX on the left side in this layout
            const capPlateLeftX = capPlateLeft.position.x - capThickness / 2;
            const capPlateRightX = capPlateRight.position.x + capThickness / 2;
   
            // Define the Y-coordinate of the top wire
            const topWireY = rectHeight / 2; // Assumes rectHeight is defined globally or accessible
            const yTolerance = 0.1; // Allow for slight deviations from exact Y
   
            for (let i = 0; i < numChargeCarriers; i++) {
                chargeCarrierProgress[i] = (chargeCarrierProgress[i] + progressDelta + 1.0) % 1.0; // Wrap progress
                try {
                    const point = circuitPath.getPointAt(chargeCarrierProgress[i]);
                    if(!point){ // Handle potential path errors
                        positions[i * 3] = offscreen.x; positions[i * 3 + 1] = offscreen.y; positions[i * 3 + 2] = offscreen.z;
                        continue;
                    };
   
                    // *** CHECK: Is the particle within the capacitor's X-range AND near the TOP wire Y? ***
                    const isNearCapX = point.x > capPlateLeftX && point.x < capPlateRightX;
                    const isNearTopY = Math.abs(point.y - topWireY) < yTolerance;
   
                    if (isNearCapX && isNearTopY) {
                         // Hide this particle (it's on the top wire segment near the capacitor)
                         positions[i * 3] = offscreen.x;
                         positions[i * 3 + 1] = offscreen.y;
                         positions[i * 3 + 2] = offscreen.z;
                    } else {
                         // Otherwise, update position normally (includes bottom wire and solenoid)
                         positions[i * 3] = point.x;
                         positions[i * 3 + 1] = point.y;
                         positions[i * 3 + 2] = point.z;
                    }
                } catch(e){
                    // Move particle off-screen if any error occurs
                    positions[i * 3] = offscreen.x; positions[i * 3 + 1] = offscreen.y; positions[i * 3 + 2] = offscreen.z;
                    continue;
                }
            }
            // Flag the position buffer attribute for update on the GPU
            chargeCarrierParticles.geometry.attributes.position.needsUpdate = true;
       }

    function updateCapacitorVisuals(currentQ) { /* (Same logic) */
        if (!capPlateLeft || !capPlateRight || !capPlateLeft.material || !capPlateRight.material) return; const maxQ_vis = Math.max(1e-9, Math.abs(Q0)); const chargeRatio = Math.max(-1, Math.min(1, currentQ / maxQ_vis)); const negColor = new THREE.Color(0x007bff); const posColor = new THREE.Color(0xdc3545); const neutralColor = new THREE.Color(0xcccccc); const leftColor = chargeRatio < 0 ? neutralColor.clone().lerp(negColor, -chargeRatio) : neutralColor.clone().lerp(posColor, chargeRatio); capPlateLeft.material.color.copy(leftColor); capPlateLeft.material.emissive.copy(leftColor).multiplyScalar(Math.abs(chargeRatio) * 0.3); const rightColor = chargeRatio > 0 ? neutralColor.clone().lerp(negColor, chargeRatio) : neutralColor.clone().lerp(posColor, -chargeRatio); capPlateRight.material.color.copy(rightColor); capPlateRight.material.emissive.copy(rightColor).multiplyScalar(Math.abs(chargeRatio) * 0.3);
    }

    // *** USES UPDATED pathSegments LOGIC for E-Field ***
    function updateFieldVisuals(currentI, currentdIdt) {
        if (!circuitPath || !pathSegments || pathSegments.length === 0 || !netBFieldArrow || eInducedArrows.length === 0) { /* Error check */ return; }

        // --- Single B-Field Arrow --- (Positions at solenoid center Y)
        const maxI_vis = Math.max(1e-6, Math.abs(Q0 / Math.sqrt(L * C))); const I_normalized = Math.min(1, Math.abs(currentI) / maxI_vis);
        const bFieldDirection = currentI >= 0 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(-1, 0, 0); // RHR for CW current
        const minLengthFactor = 0.05; const targetLength = solenoidLength * 0.7 * (minLengthFactor + I_normalized * (1.0 - minLengthFactor)); // Slightly shorter B arrow
        const headLength = Math.max(0.1, targetLength * 0.2); const headWidth = Math.max(0.08, targetLength * 0.15); const opacity = 0.4 + I_normalized * 0.5;
        if (I_normalized > 0.02) { netBFieldArrow.visible = true; bFieldLabel.visible = true; netBFieldArrow.setLength(targetLength, headLength, headWidth); netBFieldArrow.setDirection(bFieldDirection); netBFieldArrow.position.set(0, rectHeight / 2, 0); netBFieldArrow.line.material.opacity = opacity; netBFieldArrow.cone.material.opacity = opacity; } else { netBFieldArrow.visible = false; bFieldLabel.visible = false; }

        // --- E-Induced Arrows --- (Uses updated pathSegments)
        const Vl_mag = Math.abs(Vl); const max_Vl_vis = Math.max(0.1, Math.abs(Q0/C)); const Vl_normalized = Math.min(1, Vl_mag / max_Vl_vis); const eFieldDirectionSign = -Math.sign(currentdIdt); const eArrowLengthScale = 0.5 + Vl_normalized * 1.0; const eOpacity = 0.4 + Vl_normalized * 0.5;

        // Find solenoid segment using the type set in pathSegments
        const solenoidSegment = pathSegments.find(seg => seg.type === 'solenoid');
        if (!solenoidSegment) { console.warn("Solenoid segment not found in pathSegments for E-field."); eInducedLabel.visible = false; eInducedArrows.forEach(a => a.visible = false); return; }

        const solenoidStartProgress = (solenoidSegment.cumulativeLength - solenoidSegment.length) / pathLength;
        const solenoidEndProgress = solenoidSegment.cumulativeLength / pathLength;
        const solenoidProgressLength = solenoidEndProgress - solenoidStartProgress;

        if (solenoidProgressLength <= 0 || isNaN(solenoidStartProgress) || isNaN(solenoidProgressLength)) { console.warn("Solenoid progress length invalid for E-field."); eInducedLabel.visible = false; eInducedArrows.forEach(a => a.visible = false); return; }

        let eArrowsVisible = false;
        eInducedArrows.forEach((arrow, index) => {
            if (Vl_normalized > 0.05) {
                arrow.visible = true; eArrowsVisible = true;
                const eTargetLength = arrowHelperLengthBase * 0.9 * eArrowLengthScale; const eHeadLength = eTargetLength * 0.3; const eHeadWidth = eTargetLength * 0.25;
                arrow.setLength(eTargetLength, eHeadLength, eHeadWidth);
                arrow.line.material.opacity = eOpacity; arrow.cone.material.opacity = eOpacity;
                const arrowProgress = solenoidStartProgress + (index / eInducedArrows.length) * solenoidProgressLength;
                try {
                    const point = circuitPath.getPointAt(arrowProgress); const tangent = circuitPath.getTangentAt(arrowProgress).normalize(); if (!point || !tangent) throw new Error("Path error");
                    const arrowDirection = tangent.clone().multiplyScalar(eFieldDirectionSign); arrow.setDirection(arrowDirection);
                    // Offset E-field arrows slightly *outward* from the solenoid radius in Z direction
                    const offsetDir = new THREE.Vector3(0, 0, point.z).normalize(); // Direction based on Z coordinate
                    const offsetDist = wireRadius * 3.0;
                    arrow.position.copy(point).add(offsetDir.multiplyScalar(offsetDist));
                } catch(error){ arrow.visible = false; }
            } else { arrow.visible = false; }
        });
        eInducedLabel.visible = eArrowsVisible;
    }

    function updateGraphsAndInfo() { /* (Same logic) */
        const U_E = 0.5 * Q * Q / C; const U_L = 0.5 * L * I * I; const U_Total = U_E + U_L; const currentQ_uC = Q * 1e6; const currentI_mA = I * 1e3; const currentdIdt_As = dIdt; const currentUE_uJ = U_E * 1e6; const currentUL_uJ = U_L * 1e6; const currentUT_uJ = U_Total * 1e6; const currentVc_V = Vc; const currentVl_V = Vl; if (isFinite(t) && isFinite(currentQ_uC) && isFinite(currentI_mA) && isFinite(currentUE_uJ) && isFinite(currentUL_uJ) && isFinite(currentUT_uJ)) { timeData.push(t); chargeData.push(currentQ_uC); currentData.push(currentI_mA); energyCData.push(currentUE_uJ); energyLData.push(currentUL_uJ); totalEnergyData.push(currentUT_uJ); while (timeData.length > maxDataPoints) { timeData.shift(); chargeData.shift(); currentData.shift(); energyCData.shift(); energyLData.shift(); totalEnergyData.shift(); } } if (chargeCurrentChart && chargeCurrentChart.data) { chargeCurrentChart.data.labels = timeData; chargeCurrentChart.data.datasets[0].data = chargeData; chargeCurrentChart.data.datasets[1].data = currentData; if(timeData.length > 1){ chargeCurrentChart.options.scales.x.min = timeData[0]; chargeCurrentChart.options.scales.x.max = timeData[timeData.length - 1]; } chargeCurrentChart.update('none'); } if (energyChart && energyChart.data) { energyChart.data.labels = timeData; energyChart.data.datasets[0].data = energyCData; energyChart.data.datasets[1].data = energyLData; energyChart.data.datasets[2].data = totalEnergyData; if(timeData.length > 1){ energyChart.options.scales.x.min = timeData[0]; energyChart.options.scales.x.max = timeData[timeData.length - 1]; } const currentMaxEnergyGraph = Math.max(1e-6, currentUT_uJ * 1.1); energyChart.options.scales.yEnergy.suggestedMax = currentMaxEnergyGraph; energyChart.update('none'); } if (maxEnergy > 1e-12) { const eCP = Math.min(100,Math.max(0,(U_E/maxEnergy)*100)); const eLP = Math.min(100,Math.max(0,(U_L/maxEnergy)*100)); const eTP = Math.min(100,Math.max(0,(U_Total/maxEnergy)*100)); energyCBar.style.height=`${eCP}%`; energyLBar.style.height=`${eLP}%`; energyTotalBar.style.height=`${eTP}%`; energyCValueSpan.textContent=`${currentUE_uJ.toFixed(1)}µJ`; energyLValueSpan.textContent=`${currentUL_uJ.toFixed(1)}µJ`; energyTValueSpan.textContent=`${currentUT_uJ.toFixed(1)}µJ`; } else { energyCBar.style.height = `0%`; energyLBar.style.height = `0%`; energyTotalBar.style.height = `0%`; energyCValueSpan.textContent = `0 µJ`; energyLValueSpan.textContent = `0 µJ`; energyTValueSpan.textContent = `0 µJ`; } timeDisplay.textContent = t.toExponential(3); chargeDisplay.textContent = currentQ_uC.toFixed(2); currentDisplay.textContent = currentI_mA.toFixed(2); didtDisplay.textContent = currentdIdt_As.toFixed(2); vcDisplay.textContent = currentVc_V.toFixed(2); vlDisplay.textContent = currentVl_V.toFixed(2); updatePhaseInfoText(Q, I, dIdt);
    }

    function updatePhaseInfoText(q, i, didt_val) { /* (Same logic) */
         let phase = "Initializing..."; const maxQ_abs = Math.max(1e-9, Math.abs(Q0)); const maxI_abs = Math.max(1e-9, Math.abs(Q0 / Math.sqrt(L*C))); const q_rel = q / maxQ_abs; const i_rel = i / maxI_abs; if (!simulationRunning) { phase = "Paused"; } else if (Math.abs(q_rel) > 0.98 && Math.abs(i_rel) < 0.05) { phase = "Capacitor Max Charge"; } else if (Math.abs(q_rel) < 0.05 && Math.abs(i_rel) > 0.95) { phase = "Max Current / Cap Zero"; } else if ( (q > 0 && i > 0) || (q < 0 && i < 0) ) { phase = "Cap Discharging / Ind Energizing"; } else if ( (q > 0 && i < 0) || (q < 0 && i > 0) ) { phase = "Ind Discharging / Cap Recharging"; } else { phase = "Transitioning"; } phaseInfoSpan.textContent = ` ${phase} (V_C=${Vc.toFixed(1)}V, V_L=${Vl.toFixed(1)}V)`;
    }

    // ================================================
    // SIMULATION CONTROL FUNCTIONS
    // ================================================
    function startSimulation() { /* (Same) */ if (!simulationRunning) { simulationRunning = true; startButton.disabled = true; stopButton.disabled = false; maxEnergy = 0.5 * Q * Q / C + 0.5 * L * I * I; if (maxEnergy < 1e-12) maxEnergy = 1e-12; console.log("Starting simulation with Max Energy:", maxEnergy.toExponential(3)); } }
    function stopSimulation() { /* (Same) */ if (simulationRunning) { simulationRunning = false; startButton.disabled = false; stopButton.disabled = true; console.log("Simulation stopped."); updatePhaseInfoText(Q, I, dIdt); } }
    function resetSimulation() { /* (Same, calls updateVisuals) */
        stopSimulation(); console.log("Resetting simulation..."); t = 0; Q = Q0; I = 0; dIdt = 0; Vc = Q / C; Vl = 0; maxEnergy = 0.5 * Q0 * Q0 / C; if (maxEnergy < 1e-12) maxEnergy = 1e-12; timeData = []; chargeData = []; currentData = []; energyCData = []; energyLData = []; totalEnergyData = []; initializeCharts(); if (chargeCarrierParticles && circuitPath) { chargeCarrierProgress = chargeCarrierProgress.map(() => Math.random()); updateChargeCarrierPositionsSubStep(0, 0); } else { console.warn("Cannot reset charge carrier positions - objects not ready."); } updateCapacitorVisuals(Q); updateFieldVisuals(I, dIdt); updateGraphsAndInfo(); console.log("Simulation Reset Complete. Initial Q:", Q0.toExponential(3));
    }

    // ================================================
    // ANIMATION LOOP & UTILITIES
    // ================================================
    function animate() { /* (Uses sub-stepping logic from previous corrected version) */
        animationFrameId = requestAnimationFrame(animate); if (simulationRunning) { const effectiveDt = baseDt * simulationSpeedFactor; const stepsPerFrame = Math.max(1, Math.floor(30 * simulationSpeedFactor)); const dt_step = effectiveDt / stepsPerFrame; for (let i = 0; i < stepsPerFrame; i++) { if (!isFinite(Q) || !isFinite(I) || Math.abs(Q)>Math.abs(Q0)*15) { console.error("Unstable!"); stopSimulation(); phaseInfoSpan.textContent = " Stopped (Unstable!)"; return; } updatePhysics(dt_step); updateChargeCarrierPositionsSubStep(I, dt_step); } updateVisuals(); updateGraphsAndInfo(); } controls.update(); renderer.render(scene, camera);
    }

    function onWindowResize() { /* (Same) */ if (!camera || !renderer) return; camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight); }
    function setCameraPosition(x, y, z, lookAtX=0, lookAtY=0, lookAtZ=0) { /* (Same) */ gsap.to(camera.position, { x, y, z, duration: 0.7, ease: "power1.inOut" }); gsap.to(controls.target, { x: lookAtX, y: lookAtY, z: lookAtZ, duration: 0.7, ease: "power1.inOut" }); }

    // ================================================
    // MAIN EXECUTION & EVENT LISTENERS
    // ================================================
    function updateParameters() { C = parseFloat(capacitanceSlider.value) * 1e-6; L = parseFloat(inductanceSlider.value) * 1e-3; cValueSpan.textContent = capacitanceSlider.value; lValueSpan.textContent = inductanceSlider.value; period = (L > 0 && C > 0) ? 2 * Math.PI * Math.sqrt(L * C) : Infinity; resetSimulation(); }
    function updateInitialCharge() { Q0 = parseFloat(initialChargeSlider.value) * 1e-6; qValueSpan.textContent = initialChargeSlider.value; if (!simulationRunning) resetSimulation(); }
    function updateSpeed() { simulationSpeedFactor = parseFloat(simSpeedSlider.value); speedValueSpan.textContent = simulationSpeedFactor.toFixed(1); }

    console.log("Setting up simulation..."); try { initThree(); initializeCharts(); resetSimulation(); animate(); stopButton.disabled = true; speedValueSpan.textContent = simulationSpeedFactor.toFixed(1); console.log("Application setup complete. Ready."); } catch (error) { console.error("Critical Error during Initialization:", error); canvasContainer.innerHTML = `<p style="color:red; padding: 20px;">Failed to initialize 3D Simulation. Check console (F12). ${error.message}</p>`; return; }

    // --- Event Listeners --- (Adjust camera presets for new layout)
    capacitanceSlider.addEventListener('input', () => cValueSpan.textContent = capacitanceSlider.value); capacitanceSlider.addEventListener('change', updateParameters); inductanceSlider.addEventListener('input', () => lValueSpan.textContent = inductanceSlider.value); inductanceSlider.addEventListener('change', updateParameters); initialChargeSlider.addEventListener('input', () => qValueSpan.textContent = initialChargeSlider.value); initialChargeSlider.addEventListener('change', updateInitialCharge); simSpeedSlider.addEventListener('input', updateSpeed); startButton.addEventListener('click', startSimulation); stopButton.addEventListener('click', stopSimulation); resetButton.addEventListener('click', resetSimulation);
    camTopBtn.addEventListener('click', () => setCameraPosition(0, 8, 0)); // Top view Y up
    camSideBtn.addEventListener('click', () => setCameraPosition(-rectWidth / 2 - 2, 0, 6)); // Side view looking along +X
    camIsoBtn.addEventListener('click', () => setCameraPosition(4, 4, 5)); // Reset isometric

}); // End DOMContentLoaded