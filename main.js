        // ============================================================================
        // 3D Particle Visualization System
        // ============================================================================
        // A canvas-based particle system with 3D rotation, multi-frame morphing,
        // SVG/image input support, and various visual effects.
        //
        // Main Features:
        // - 3D rotation with X/Y/Z axis control
        // - Multi-frame morph system (animate between different shapes)
        // - SVG and image file input with edge/fill sampling
        // - Depth fog, perspective projection, wireframe mode
        // - Export/import frames as JSON for use in other projects
        // - Performance monitoring panel
        // ============================================================================


        // ============================================================================
        // SECTION 1: CANVAS SETUP
        // ============================================================================
        
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        
        // Resize canvas to fill the browser window
        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        resize();
        window.addEventListener('resize', resize);
        
        
        // ============================================================================
        // SECTION 2: GLOBAL CONFIGURATION VARIABLES
        // ============================================================================
        
        // --- Rotation Center (Camera Position) ---
        // These define the fixed center point around which all 3D rotation occurs.
        // Updated automatically when window resizes.
        let rotationCenterX = canvas.width / 2;
        let rotationCenterY = canvas.height / 2;
        let rotationCenterZ = 0;
        
        // Update rotation center when window resizes
        function updateRotationCenter() {
            rotationCenterX = canvas.width / 2;
            rotationCenterY = canvas.height / 2;
            rotationCenterZ = 0;
        }
        updateRotationCenter();
        window.addEventListener('resize', updateRotationCenter);
        
        // --- Animation State ---
        let animTime = 0;                    // Frame counter for time-based animation
        let animationEnabled = true;         // True = continuous rotation, False = static/manual
        let lastTime = 0;                    // Timestamp of last frame for FPS calculation
        let fps = 0;                         // Current frames per second
        
        // --- Rotation Control ---
        let staticRotX = 0;                  // Static X rotation angle (radians) when animation disabled
        let staticRotY = 0;                  // Static Y rotation angle (radians) when animation disabled
        let staticRotZ = 0;                  // Static Z rotation angle (radians) when animation disabled
        
        // --- Hover Rotation ---
        let hoverRotateEnabled = false;      // Mouse position controls rotation when true
        let lastMouseX = 0;                  // Last mouse X position
        let lastMouseY = 0;                  // Last mouse Y position
        let lastHoverMaxCache = 45;          // Cached max rotation degrees for hover mode
        let lastHoverUpdateTime = 0;         // Timestamp for throttling hover updates
        let hoverUpdateThrottle = 16;        // Milliseconds between hover UI updates (~60fps)
        
        // --- Particle System ---
        const particles = [];                // Main array holding all Particle objects
        let svgPoints = [];                  // Extracted points from loaded SVG/image
        
        // --- Multi-Frame Morph System ---
        let frames = [];                     // Array of saved frames: {name, points[], pointCount}
        let currentFrameIndex = 0;           // Index of currently displayed frame
        let isMorphing = false;              // True while morph animation is in progress
        let morphProgress = 0;               // Progress of current morph (0.0 to 1.0)
        let morphSpeed = 0.02;               // Speed of morph animation per frame
        
        // --- Image/SVG Input State ---
        let currentInputType = 'svg';        // Current input type: 'svg' or 'image'
        let currentImageFile = null;         // Stored image data URL for reprocessing
        let imageScale = 1;                  // Scale factor for rendered particles
        
        // --- Wireframe Mode ---
        let wireframeConnections = [];       // Array of [index1, index2] pairs for wireframe lines
        
        // --- Performance Monitoring ---
        let perfEnabled = false;             // Performance debug panel enabled
        let frameTimes = [];                 // Rolling buffer of frame durations (ms)
        let jankCount = 0;                   // Count of frames that took too long
        let longTaskCount = 0;               // Count of detected long tasks
        const perfBufferSize = 120;          // Number of frames to track (~2 seconds at 60fps)
        const jankThreshold = 33;            // Frame time above this (ms) counts as jank
        
        // --- Draw Cache (Reduce DOM Lookups) ---
        let drawCache = {
            wireframeEnabled: false          // Cached wireframe toggle state
        };
        let lastDrawCacheUpdate = 0;         // Timestamp of last cache update
        
        // --- Mouse Drag State ---
        let isDragging = false;              // Mouse button is held down
        let dragMoved = false;               // Mouse moved while dragging
        
        
        // ============================================================================
        // SECTION 3: COLOR PALETTES
        // ============================================================================
        
        // Available color palettes for mapping image colors.
        // Each palette is an array of RGB color objects.
        const colorPalettes = {
            // CGA 16-color palette (classic PC graphics)
            cga: [
                { r: 0,   g: 0,   b: 0   },   // Black
                { r: 0,   g: 0,   b: 170 },   // Blue
                { r: 0,   g: 170, b: 0   },   // Green
                { r: 0,   g: 170, b: 170 },   // Cyan
                { r: 170, g: 0,   b: 0   },   // Red
                { r: 170, g: 0,   b: 170 },   // Magenta
                { r: 170, g: 85,  b: 0   },   // Brown
                { r: 170, g: 170, b: 170 },   // Light Gray
                { r: 85,  g: 85,  b: 85  },   // Dark Gray
                { r: 85,  g: 85,  b: 255 },   // Light Blue
                { r: 85,  g: 255, b: 85  },   // Light Green
                { r: 85,  g: 255, b: 255 },   // Light Cyan
                { r: 255, g: 85,  b: 85  },   // Light Red
                { r: 255, g: 85,  b: 255 },   // Light Magenta
                { r: 255, g: 255, b: 85  },   // Yellow
                { r: 255, g: 255, b: 255 }    // White
            ]
        };
        
        // Find the closest matching color in a palette using Euclidean distance
        // Parameters: r, g, b - source color to match
        //             paletteColors - array of {r, g, b} color objects
        // Returns: The palette color object with smallest distance
        function getNearestPaletteColor(r, g, b, paletteColors) {
            let minDist = Infinity;
            let nearestColor = paletteColors[0];
            
            for (let color of paletteColors) {
                // Calculate squared Euclidean distance (skip sqrt for performance)
                const dr = r - color.r;
                const dg = g - color.g;
                const db = b - color.b;
                const dist = dr * dr + dg * dg + db * db;
                
                if (dist < minDist) {
                    minDist = dist;
                    nearestColor = color;
                }
            }
            
            return nearestColor;
        }
        
        // ============================================================================
        // SECTION 4: PARTICLE CLASS
        // ============================================================================
        // The Particle class represents a single point in 3D space that can be
        // rendered on the 2D canvas. Particles support:
        // - 3D position with rotation transforms
        // - Color from source image or palette mapping
        // - Smooth morphing between positions (for frame transitions)
        // - Depth-based sizing and opacity (fog effect)
        // ============================================================================
        
        class Particle {
            // Constructor Parameters:
            //   x, y     - Initial screen position (random if not provided)
            //   layer    - Depth layer for size reduction (1 = front)
            //   targetX, targetY - Anchor position for SVG/image particles
            //   baseZ    - Initial Z depth for 3D rotation
            constructor(x, y, layer, targetX, targetY, baseZ) {
                // --- Position ---
                this.x = x || Math.random() * canvas.width;   // Current screen X
                this.y = y || Math.random() * canvas.height;  // Current screen Y
                
                // --- Velocity (for free-floating particles) ---
                this.vx = (Math.random() - 0.5) * 2;          // X velocity
                this.vy = (Math.random() - 0.5) * 2;          // Y velocity
                
                // --- Layer and Depth ---
                this.layer = layer || 1;                      // Rendering layer (affects size)
                
                // --- Base Position (before rotation transform) ---
                // These are the "home" coordinates that rotation is applied to
                this.targetX = targetX;
                this.targetY = targetY;
                this.baseX = targetX || this.x;               // Base X before rotation
                this.baseY = targetY || this.y;               // Base Y before rotation
                this.baseZ = baseZ || 0;                      // Base Z depth
                this.currentZ = this.baseZ;                   // Z after rotation (for sorting)
                
                // --- Anchor State ---
                // Anchored particles stay at their target position, free particles can drift
                this.hasTarget = targetX !== undefined && targetY !== undefined;
                
                // --- Source Color (from image/SVG) ---
                this.sourceR = 74;   // Default green color
                this.sourceG = 222;
                this.sourceB = 128;
                
                // --- Display Values (smoothed for animation) ---
                // These are interpolated toward target values each frame
                this.displaySize = 1;
                this.displayR = 74;
                this.displayG = 222;
                this.displayB = 128;
                this.displayOpacity = 1;
                
                // --- Morph Animation State ---
                // Used when transitioning between frames
                this.morphTargetX = this.baseX;               // Target X for morph
                this.morphTargetY = this.baseY;               // Target Y for morph
                this.morphTargetZ = this.baseZ;               // Target Z for morph
                this.morphTargetR = this.sourceR;             // Target R for morph
                this.morphTargetG = this.sourceG;             // Target G for morph
                this.morphTargetB = this.sourceB;             // Target B for morph
                this.morphStartX = this.baseX;                // Start X for morph
                this.morphStartY = this.baseY;                // Start Y for morph
                this.morphStartZ = this.baseZ;                // Start Z for morph
                this.morphStartR = this.sourceR;              // Start R for morph
                this.morphStartG = this.sourceG;              // Start G for morph
                this.morphStartB = this.sourceB;              // Start B for morph
                
                // --- Removal Flag ---
                // Set to true when this particle should be removed after morph completes
                // (used when target frame has fewer particles than current)
                this.markedForRemoval = false;
            }
            
            // Update position and color during morph animation
            // Parameter: progress - value from 0.0 (start) to 1.0 (end)
            updateMorph(progress) {
                // Cubic ease-in-out function for smooth acceleration/deceleration
                const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
                const t = ease(progress);
                
                // Interpolate position from start to target
                this.baseX = this.morphStartX + (this.morphTargetX - this.morphStartX) * t;
                this.baseY = this.morphStartY + (this.morphTargetY - this.morphStartY) * t;
                this.baseZ = this.morphStartZ + (this.morphTargetZ - this.morphStartZ) * t;
                
                // Interpolate color from start to target
                this.sourceR = Math.round(this.morphStartR + (this.morphTargetR - this.morphStartR) * t);
                this.sourceG = Math.round(this.morphStartG + (this.morphTargetG - this.morphStartG) * t);
                this.sourceB = Math.round(this.morphStartB + (this.morphTargetB - this.morphStartB) * t);
            }
            
            // Set the target position/color for morph animation
            // Parameter: point - object with {targetX, targetY, baseZ, r, g, b}
            setMorphTarget(point) {
                // Store current values as morph start point
                this.morphStartX = this.baseX;
                this.morphStartY = this.baseY;
                this.morphStartZ = this.baseZ;
                this.morphStartR = this.sourceR;
                this.morphStartG = this.sourceG;
                this.morphStartB = this.sourceB;
                
                // Set morph destination
                this.morphTargetX = point.targetX;
                this.morphTargetY = point.targetY;
                this.morphTargetZ = point.baseZ || 0;
                this.morphTargetR = point.r !== undefined ? point.r : 74;
                this.morphTargetG = point.g !== undefined ? point.g : 222;
                this.morphTargetB = point.b !== undefined ? point.b : 128;
            }
            
            // Update particle position based on rotation settings
            // Called every frame before drawing
            update() {
                // Read control values from UI
                const speed = parseFloat(document.getElementById('speed').value);
                const rotX = parseFloat(document.getElementById('rotX').value) * Math.PI / 180;
                const rotY = parseFloat(document.getElementById('rotY').value) * Math.PI / 180;
                const rotZ = parseFloat(document.getElementById('rotZ').value) * Math.PI / 180;
                
                // CASE 1: No rotation applied
                // Particles stay at their base position or drift if free-floating
                if (rotX === 0 && rotY === 0 && rotZ === 0) {
                    if (this.hasTarget) {
                        // Anchored particles stay fixed at their target position
                        this.x = this.baseX;
                        this.y = this.baseY;
                        this.currentZ = this.baseZ;
                    } else {
                        // Free-floating particles drift with velocity
                        this.x += this.vx * speed;
                        this.y += this.vy * speed;
                        // Bounce off canvas edges
                        if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
                        if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
                        this.currentZ = this.baseZ;
                    }
                    return;
                }
                
                // CASE 2: 3D rotation is active
                // Apply rotation transforms around the fixed camera center
                const centerX = rotationCenterX;
                const centerY = rotationCenterY;

                // Get position relative to rotation center
                let x = this.baseX - centerX;
                let y = this.baseY - centerY;
                let z = this.baseZ;
                
                // Calculate rotation angles based on animation mode
                let angleX, angleY, angleZ;
                if (animationEnabled) {
                    // Animated mode: rotation accumulates over time
                    const t = animTime * speed * 0.01;
                    angleX = rotX * t;
                    angleY = rotY * t;
                    angleZ = rotZ * t;
                } else {
                    // Static mode: use fixed rotation angles from sliders
                    angleX = staticRotX;
                    angleY = staticRotY;
                    angleZ = staticRotZ;
                }
                
                // Apply rotation around X axis (pitch - tilts up/down)
                if (angleX !== 0) {
                    const y1 = y * Math.cos(angleX) - z * Math.sin(angleX);
                    const z1 = y * Math.sin(angleX) + z * Math.cos(angleX);
                    y = y1; z = z1;
                }
                
                // Apply rotation around Y axis (yaw - spins left/right)
                if (angleY !== 0) {
                    const x1 = x * Math.cos(angleY) + z * Math.sin(angleY);
                    const z1 = -x * Math.sin(angleY) + z * Math.cos(angleY);
                    x = x1; z = z1;
                }
                
                // Apply rotation around Z axis (roll - rotates in place)
                if (angleZ !== 0) {
                    const x1 = x * Math.cos(angleZ) - y * Math.sin(angleZ);
                    const y1 = x * Math.sin(angleZ) + y * Math.cos(angleZ);
                    x = x1; y = y1;
                }
                
                // Store current Z for depth sorting and size calculation
                this.currentZ = z;
                
                // Project 3D position back to 2D screen coordinates
                // Using simple orthographic projection (no perspective distortion)
                this.x = x + centerX;
                this.y = y + centerY;
            }
            
            // Draw the particle on the canvas
            // Parameter: maxZ - maximum Z depth in scene, used for fog/sizing calculations
            draw(maxZ) {
                // Read rendering settings from UI
                const baseSize = parseFloat(document.getElementById('size').value);
                const reduction = parseFloat(document.getElementById('reduction').value);
                const depthScale = parseFloat(document.getElementById('depthScale').value);
                const usePerspective = document.getElementById('perspective').checked;
                const useDepthFog = document.getElementById('depthFog').checked;
                
                // Calculate draw position (may differ from actual position with perspective)
                let drawX = this.x;
                let drawY = this.y;
                let perspectiveScale = 1;
                
                // Apply perspective projection if enabled
                // Objects further away appear smaller and closer to center
                if (usePerspective && maxZ > 0) {
                    const focalLength = 800;  // Distance from camera to screen
                    const distance = focalLength - this.currentZ;
                    perspectiveScale = focalLength / distance;
                    
                    // Scale position from center based on perspective
                    const centerX = rotationCenterX;
                    const centerY = rotationCenterY;
                    drawX = centerX + (this.x - centerX) * perspectiveScale;
                    drawY = centerY + (this.y - centerY) * perspectiveScale;
                }
                
                // Calculate target size based on layer (higher layer = smaller)
                let targetSize = Math.max(0.5, baseSize - (this.layer - 1) * reduction);

                // Apply depth-based size scaling
                // Objects further away (higher Z) appear larger after rotation
                if (maxZ > 0) {
                    const normalizedZ = this.currentZ / maxZ;
                    const depthFactor = 1 + normalizedZ * depthScale * 0.3;
                    targetSize = Math.max(0.3, targetSize * depthFactor * perspectiveScale);
                }

                // Calculate target opacity based on depth (layer and fog effects)
                let targetOpacity = Math.max(0.2, 1 - (this.layer - 1) * 0.04);
                
                // Apply depth fog if enabled
                // Objects further back fade out, creating depth illusion
                if (maxZ > 0 && useDepthFog) {
                    // Normalize Z to 0-1 range for smooth gradient
                    const normalizedZ = (this.currentZ + maxZ) / (2 * maxZ);
                    // Quadratic easing for smoother falloff
                    const easeZ = normalizedZ * normalizedZ;
                    // Map to opacity: front = more opaque, back = more transparent
                    targetOpacity = Math.max(0.05, 0.15 + easeZ * 0.85);
                }

                // Determine target color (palette mapping or source color)
                let targetR, targetG, targetB;
                const useColorPalette = document.getElementById('useColorPalette').checked;
                
                if (useColorPalette) {
                    // Map source color to nearest palette color
                    const paletteName = document.getElementById('colorPalette').value;
                    const paletteColors = colorPalettes[paletteName];
                    const mappedColor = getNearestPaletteColor(this.sourceR, this.sourceG, this.sourceB, paletteColors);
                    targetR = mappedColor.r;
                    targetG = mappedColor.g;
                    targetB = mappedColor.b;
                } else {
                    // Use original source color
                    targetR = this.sourceR;
                    targetG = this.sourceG;
                    targetB = this.sourceB;
                }

                // Smooth interpolation of display values
                // Prevents jarring changes when settings or depth changes rapidly
                const speedVal = parseFloat(document.getElementById('speed').value);
                let smooth = 0.06 + (depthScale / 10) + (useDepthFog ? 0.08 : 0) + (speedVal / 50);
                smooth = Math.max(0.02, Math.min(0.6, smooth));  // Clamp smoothing factor
                
                // Apply exponential smoothing to all display properties
                this.displaySize += (targetSize - this.displaySize) * smooth;
                this.displayOpacity += (targetOpacity - this.displayOpacity) * smooth;
                this.displayR += (targetR - this.displayR) * smooth;
                this.displayG += (targetG - this.displayG) * smooth;
                this.displayB += (targetB - this.displayB) * smooth;

                // Round color values for valid CSS
                const r = Math.round(this.displayR);
                const g = Math.round(this.displayG);
                const b = Math.round(this.displayB);
                const opacity = this.displayOpacity;

                // Draw the particle as a filled circle
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
                ctx.beginPath();
                ctx.arc(drawX, drawY, this.displaySize, 0, Math.PI * 2);
                ctx.fill();
                
                // Store screen position for wireframe connections
                this.screenX = drawX;
                this.screenY = drawY;
            }
        }
        
        // ============================================================================
        // SECTION 5: MULTI-FRAME MORPH SYSTEM
        // ============================================================================
        // This system allows saving particle configurations as "frames" and smoothly
        // animating transitions between them. Use cases:
        // - Morph between different shapes (e.g., logo -> text -> icon)
        // - Create animated sequences by cycling through frames
        // - Export/import frames for use across different projects
        // ============================================================================
        
        // Save the current particle state as a new frame
        function addCurrentAsFrame() {
            if (particles.length === 0) {
                console.log('No particles to save as frame');
                return;
            }
            
            // Store particle data as a frame
            const frameData = particles.map(p => ({
                targetX: p.baseX,
                targetY: p.baseY,
                baseZ: p.baseZ,
                r: p.sourceR,
                g: p.sourceG,
                b: p.sourceB
            }));
            
            const frameName = `Frame ${frames.length + 1}`;
            frames.push({
                name: frameName,
                points: frameData,
                pointCount: frameData.length
            });
            
            currentFrameIndex = frames.length - 1;
            updateFrameList();
            console.log(`Added ${frameName} with ${frameData.length} points`);
        }
        
        // Update the frame list UI
        function updateFrameList() {
            const listDiv = document.getElementById('frameList');
            const countSpan = document.getElementById('frameCount');
            
            countSpan.textContent = frames.length;
            
            if (frames.length === 0) {
                listDiv.innerHTML = '<div style="padding: 8px; color: #666; font-size: 10px;">No frames added yet</div>';
                return;
            }
            
            listDiv.innerHTML = frames.map((frame, idx) => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; border-bottom: 1px solid #222; ${idx === currentFrameIndex ? 'background: #2a3a2a;' : ''}">
                    <span style="font-size: 10px; ${idx === currentFrameIndex ? 'color: #4ade80;' : 'color: #888;'}">
                        ${idx === currentFrameIndex ? '▶ ' : ''}${frame.name} (${frame.pointCount} pts)
                    </span>
                    <button onclick="removeFrame(${idx})" style="padding: 2px 6px; font-size: 9px; background: #4a2020; border: none; color: #f87171; cursor: pointer; border-radius: 3px;">✕</button>
                </div>
            `).join('');
        }
        
        // Remove a frame
        function removeFrame(index) {
            frames.splice(index, 1);
            if (currentFrameIndex >= frames.length) {
                currentFrameIndex = Math.max(0, frames.length - 1);
            }
            updateFrameList();
            console.log(`Removed frame ${index + 1}`);
        }
        
        // Clear all frames
        function clearAllFrames() {
            frames = [];
            currentFrameIndex = 0;
            updateFrameList();
            console.log('Cleared all frames');
        }
        
        // Morph to next frame
        function morphToNextFrame() {
            if (frames.length < 2) {
                console.log('Need at least 2 frames to morph');
                return;
            }
            
            const nextIndex = (currentFrameIndex + 1) % frames.length;
            morphToFrame(nextIndex);
        }
        
        // Morph to previous frame
        function morphToPrevFrame() {
            if (frames.length < 2) {
                console.log('Need at least 2 frames to morph');
                return;
            }
            
            const prevIndex = (currentFrameIndex - 1 + frames.length) % frames.length;
            morphToFrame(prevIndex);
        }
        
        // Morph to specific frame
        function morphToFrame(targetIndex) {
            if (isMorphing) return;
            if (targetIndex === currentFrameIndex) return;
            if (targetIndex < 0 || targetIndex >= frames.length) return;
            
            const targetFrame = frames[targetIndex];
            const targetPoints = targetFrame.points;
            const existingCount = particles.length;
            const targetCount = targetPoints.length;
            
            // Clear removal flags on all existing particles
            for (let i = 0; i < particles.length; i++) {
                particles[i].markedForRemoval = false;
            }
            
            // Add particles if target has more points than current
            // New particles spawn at positions of existing particles for smooth appearance
            while (particles.length < targetCount) {
                const sourceParticle = particles[Math.floor(Math.random() * existingCount)];
                const p = new Particle(
                    sourceParticle.baseX,
                    sourceParticle.baseY,
                    1,
                    sourceParticle.baseX,
                    sourceParticle.baseY,
                    sourceParticle.baseZ
                );
                p.sourceR = sourceParticle.sourceR;
                p.sourceG = sourceParticle.sourceG;
                p.sourceB = sourceParticle.sourceB;
                particles.push(p);
            }
            
            // Set morph targets for all particles
            for (let i = 0; i < particles.length; i++) {
                if (i < targetCount) {
                    // Particle has a target position in the new frame
                    particles[i].setMorphTarget(targetPoints[i]);
                    particles[i].markedForRemoval = false;
                } else {
                    // Excess particle: morph to merge with a random target, then remove
                    const mergeTarget = targetPoints[Math.floor(Math.random() * targetCount)];
                    particles[i].setMorphTarget(mergeTarget);
                    particles[i].markedForRemoval = true;
                }
            }
            
            // Start morph animation
            isMorphing = true;
            morphProgress = 0;
            currentFrameIndex = targetIndex;
            updateFrameList();
            
            console.log('Morphing to ' + targetFrame.name);
        }
        
        // Export current frame as JSON file
        function exportCurrentFrame() {
            if (particles.length === 0) {
                alert('No particles to export. Add particles first.');
                return;
            }
            
            // Create frame data from current particles
            const frameData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                frame: {
                    name: 'Exported Frame',
                    pointCount: particles.length,
                    points: particles.map(p => ({
                        x: p.baseX,
                        y: p.baseY,
                        z: p.baseZ,
                        r: p.sourceR,
                        g: p.sourceG,
                        b: p.sourceB
                    }))
                }
            };
            
            downloadJSON(frameData, 'particle-frame.json');
            console.log('Exported current frame with ' + particles.length + ' points');
        }
        
        // Export all saved frames as JSON file
        function exportAllFrames() {
            if (frames.length === 0) {
                alert('No frames to export. Add frames first using "Add Current as Frame".');
                return;
            }
            
            const exportData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                frameCount: frames.length,
                frames: frames.map(frame => ({
                    name: frame.name,
                    pointCount: frame.pointCount,
                    points: frame.points.map(p => ({
                        x: p.targetX,
                        y: p.targetY,
                        z: p.baseZ || 0,
                        r: p.r !== undefined ? p.r : 74,
                        g: p.g !== undefined ? p.g : 222,
                        b: p.b !== undefined ? p.b : 128
                    }))
                }))
            };
            
            downloadJSON(exportData, 'particle-frames.json');
            console.log('Exported ' + frames.length + ' frames');
        }
        
        // Helper function to download JSON data as file
        function downloadJSON(data, filename) {
            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
        
        // Trigger file input for importing frames
        function importFrames() {
            document.getElementById('importFrameFile').click();
        }
        
        // Handle frame import from file
        function handleFrameImport(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    
                    // Validate data structure
                    if (!data.version) {
                        alert('Invalid file format: missing version');
                        return;
                    }
                    
                    // Handle single frame export
                    if (data.frame) {
                        importSingleFrame(data.frame);
                    }
                    // Handle multiple frames export
                    else if (data.frames && Array.isArray(data.frames)) {
                        data.frames.forEach(frame => importSingleFrame(frame));
                    }
                    else {
                        alert('Invalid file format: no frame data found');
                        return;
                    }
                    
                    updateFrameList();
                    console.log('Import complete');
                    
                } catch (err) {
                    console.error('Import error:', err);
                    alert('Failed to import: ' + err.message);
                }
            };
            reader.readAsText(file);
            
            // Reset input so same file can be imported again
            event.target.value = '';
        }
        
        // Import a single frame from parsed data
        function importSingleFrame(frameData) {
            const points = frameData.points.map(p => ({
                targetX: p.x,
                targetY: p.y,
                baseZ: p.z || 0,
                r: p.r,
                g: p.g,
                b: p.b
            }));
            
            frames.push({
                name: frameData.name || ('Imported Frame ' + (frames.length + 1)),
                points: points,
                pointCount: points.length
            });
            
            console.log('Imported frame: ' + frameData.name + ' with ' + points.length + ' points');
        }
        
        
        // ============================================================================
        // SECTION 6: 3D EFFECTS AND TRANSFORMATIONS
        // ============================================================================
        // Functions for applying 3D effects to particles including:
        // - Extrusion: Add depth/thickness to flat shapes
        // - Projections: Create multiple rotated copies
        // - Wireframe: Connect nearby particles with lines
        // - Sphere generation: Create 3D sphere point distribution
        // ============================================================================
        
        // Apply extrusion effect to create depth from flat SVG points
        // Creates multiple layers of particles at different Z depths
        function applyExtrusion() {
            if (svgPoints.length === 0) return;
            
            const extrusion = parseFloat(document.getElementById('extrusion').value);
            const projections = parseInt(document.getElementById('projections').value);
            
            // If both extrusion and projections, use combined approach
            if (extrusion > 0 && projections > 1) {
                applyProjections();
                return;
            }
            
            if (extrusion === 0) {
                // Reset to flat
                if (projections > 1) {
                    applyProjections();
                } else {
                    autoAddParticlesFromSVG();
                }
                return;
            }
            
            particles.length = 0;
            const layers = parseInt(document.getElementById('extrusionLayers').value);
            const layer = parseInt(document.getElementById('layer').value);
            
            // Create multiple depth layers
            for (let l = 0; l < layers; l++) {
                const zDepth = (l - (layers - 1) / 2) * (extrusion / layers);
                
                for (let i = 0; i < svgPoints.length; i++) {
                    const point = svgPoints[i];
                    const centerX = canvas.width / 2;
                    const centerY = canvas.height / 2;
                    
                    const svgCenterX = svgPoints.reduce((sum, p) => sum + p.x, 0) / svgPoints.length;
                    const svgCenterY = svgPoints.reduce((sum, p) => sum + p.y, 0) / svgPoints.length;
                    
                    const targetX = centerX + (point.x - svgCenterX) * 3 * imageScale;
                    const targetY = centerY + (point.y - svgCenterY) * 3 * imageScale;
                    
                    const p = new Particle(targetX, targetY, layer, targetX, targetY, zDepth);
                    particles.push(p);
                }
            }
            
            updateCount();
            console.log(`Extruded ${layers} layers, depth: ${extrusion}`);
        }
        
        // Create multiple rotated projections of the particle shape
        // Useful for creating symmetrical 3D forms from 2D shapes
        function applyProjections() {
            if (svgPoints.length === 0) return;
            
            particles.length = 0;
            
            const numProjections = parseInt(document.getElementById('projections').value);
            const extrusion = parseFloat(document.getElementById('extrusion').value);
            const extrusionLayers = parseInt(document.getElementById('extrusionLayers').value);
            const projectionAxis = document.getElementById('projectionAxis').value;
            const layer = parseInt(document.getElementById('layer').value);
            
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const svgCenterX = svgPoints.reduce((sum, p) => sum + p.x, 0) / svgPoints.length;
            const svgCenterY = svgPoints.reduce((sum, p) => sum + p.y, 0) / svgPoints.length;
            
            // Create each projection at a different rotation offset
            for (let proj = 0; proj < numProjections; proj++) {
                const angle = (proj * 2 * Math.PI) / numProjections;
                
                // Determine which extrusion layers to create
                const layers = extrusion > 0 ? extrusionLayers : 1;
                
                for (let l = 0; l < layers; l++) {
                    const zDepth = extrusion > 0 ? (l - (layers - 1) / 2) * (extrusion / layers) : 0;
                    
                    for (let i = 0; i < svgPoints.length; i++) {
                        const point = svgPoints[i];
                        
                        // Get point position relative to SVG center
                        let x = (point.x - svgCenterX) * 3 * imageScale;
                        let y = (point.y - svgCenterY) * 3 * imageScale;
                        let z = zDepth;
                        
                        // Apply rotation around selected axis
                        let rotX = x, rotY = y, rotZ = z;
                        if (projectionAxis === 'y') {
                            // Rotate around Y-axis (horizontal spin)
                            rotX = x * Math.cos(angle) + z * Math.sin(angle);
                            rotY = y;
                            rotZ = -x * Math.sin(angle) + z * Math.cos(angle);
                        } else if (projectionAxis === 'z') {
                            // Rotate around Z-axis (flat rotation)
                            rotX = x * Math.cos(angle) - y * Math.sin(angle);
                            rotY = x * Math.sin(angle) + y * Math.cos(angle);
                            rotZ = z;
                        } else if (projectionAxis === 'x') {
                            // Rotate around X-axis (vertical flip)
                            rotX = x;
                            rotY = y * Math.cos(angle) - z * Math.sin(angle);
                            rotZ = y * Math.sin(angle) + z * Math.cos(angle);
                        }
                        
                        const targetX = centerX + rotX;
                        const targetY = centerY + rotY;
                        
                        const p = new Particle(targetX, targetY, layer, targetX, targetY, rotZ);
                        particles.push(p);
                    }
                }
            }
            
            updateCount();
            console.log(`Created ${numProjections} projections around ${projectionAxis}-axis`);
            
            // Rebuild wireframe connections with new particle positions
            if (document.getElementById('wireframe').checked) {
                updateWireframe();
            }
        }
        
        // Build wireframe connections between nearby particles
        // Creates line segments for 3D wireframe visualization
        function updateWireframe() {
            if (!document.getElementById('wireframe').checked) {
                wireframeConnections = [];
                return;
            }
            
            // Build connections between nearby points
            wireframeConnections = [];
            const maxDist = 30;
            
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].baseX - particles[j].baseX;
                    const dy = particles[i].baseY - particles[j].baseY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    
                    if (dist < maxDist) {
                        wireframeConnections.push([i, j]);
                    }
                }
            }
            
            console.log(`Created ${wireframeConnections.length} wireframe connections`);
        }
        
        // Generate a 3D sphere of evenly distributed points
        // Uses Fibonacci sphere algorithm for uniform distribution
        function generateSphere() {
            particles.length = 0;
            
            const numPoints = parseInt(document.getElementById('spherePoints').value);
            const radius = parseFloat(document.getElementById('sphereRadius').value);
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            
            // Use Fibonacci sphere for even distribution
            const goldenRatio = (1 + Math.sqrt(5)) / 2;
            
            for (let i = 0; i < numPoints; i++) {
                // Fibonacci sphere algorithm
                const theta = 2 * Math.PI * i / goldenRatio;
                const phi = Math.acos(1 - 2 * (i + 0.5) / numPoints);
                
                const x = radius * Math.sin(phi) * Math.cos(theta);
                const y = radius * Math.sin(phi) * Math.sin(theta);
                const z = radius * Math.cos(phi);
                
                const p = new Particle(
                    centerX + x, 
                    centerY + y, 
                    1, 
                    centerX + x, 
                    centerY + y,
                    z
                );
                p.baseX = centerX + x;
                p.baseY = centerY + y;
                p.baseZ = z;
                particles.push(p);
            }
            
            updateCount();
            console.log(`Generated sphere with ${numPoints} points`);
        }
        
        
        // ============================================================================
        // SECTION 7: PARTICLE MANAGEMENT
        // ============================================================================
        // Functions for adding, removing, and managing particles
        // ============================================================================
        
        // Add particles to the scene
        // If SVG points are loaded, new particles follow those positions
        function addParticles(count) {
            const layer = parseInt(document.getElementById('layer').value);
            
            console.log('Adding particles, svgPoints.length =', svgPoints.length);
            
            for (let i = 0; i < count; i++) {
                // If SVG points exist, use them
                if (svgPoints.length > 0) {
                    const point = svgPoints[i % svgPoints.length];
                    const centerX = canvas.width / 2;
                    const centerY = canvas.height / 2;
                    const targetX = centerX + (point.x - svgPoints[0].x);
                    const targetY = centerY + (point.y - svgPoints[0].y);
                    particles.push(new Particle(targetX, targetY, layer, targetX, targetY));
                } else {
                    particles.push(new Particle(null, null, layer));
                }
            }
            updateCount();
        }
        
        // Remove all particles from the scene
        function clearParticles() {
            particles.length = 0;
            updateCount();
        }
        
        // Update the particle count display in the UI
        function updateCount() {
            document.getElementById('count').textContent = particles.length;
        }
        
        
        // ============================================================================
        // SECTION 8: SVG AND IMAGE LOADING
        // ============================================================================
        // Functions for loading SVG code or image files and extracting point data.
        // Supports two sampling modes:
        // - Fill: Sample all visible pixels at regular intervals
        // - Border: Sample only edge/outline pixels
        // ============================================================================
        
        // Parse SVG code from textarea and extract point positions
        function loadSVG() {
            const svgCode = document.getElementById('svgInput').value.trim();
            const statusDiv = document.getElementById('svgStatus');
            
            if (!svgCode) {
                svgPoints = [];
                statusDiv.textContent = 'Paste SVG or upload image to auto-load';
                statusDiv.style.color = '#888';
                return;
            }
            
            currentInputType = 'svg';
            
            try {
                // Parse SVG
                const parser = new DOMParser();
                const svgDoc = parser.parseFromString(svgCode, 'image/svg+xml');
                const svgElement = svgDoc.querySelector('svg');
                
                if (!svgElement) {
                    statusDiv.textContent = '[!] Invalid SVG code';
                    statusDiv.style.color = '#f87171';
                    return;
                }
                
                statusDiv.textContent = 'Processing SVG...';
                statusDiv.style.color = '#facc15';
                
                // Get viewBox or use default
                const viewBox = svgElement.getAttribute('viewBox');
                let svgWidth, svgHeight;
                if (viewBox) {
                    const [, , w, h] = viewBox.split(' ').map(parseFloat);
                    svgWidth = w;
                    svgHeight = h;
                } else {
                    svgWidth = parseFloat(svgElement.getAttribute('width')) || 100;
                    svgHeight = parseFloat(svgElement.getAttribute('height')) || 100;
                }
                
                // Sample points from SVG
                sampleSVGPoints(svgElement, svgWidth, svgHeight, statusDiv);
                
            } catch (error) {
                console.error('Error loading SVG:', error);
                statusDiv.textContent = '[!] Error: ' + error.message;
                statusDiv.style.color = '#f87171';
            }
        }
        
        // Load and process an image file from file input
        // Handles PNG, JPEG, WebP, and GIF formats
        function loadImageFile() {
            const fileInput = document.getElementById('imageFile');
            const statusDiv = document.getElementById('svgStatus');
            
            console.log('loadImageFile called, files:', fileInput.files);
            
            if (!fileInput.files || fileInput.files.length === 0) {
                statusDiv.textContent = 'No image selected';
                statusDiv.style.color = '#888';
                return;
            }
            
            const file = fileInput.files[0];
            console.log('Loading file:', file.name, file.type, file.size);
            
            const reader = new FileReader();
            
            reader.onload = function(e) {
                console.log('FileReader loaded, data length:', e.target.result.length);
                statusDiv.textContent = 'Processing image...';
                statusDiv.style.color = '#facc15';
                
                // Store the data URL for reloading with different settings
                currentImageFile = e.target.result;
                currentInputType = 'image';
                
                const img = new Image();
                img.onload = function() {
                    processImageWithSettings(img, statusDiv);
                };
                
                img.onerror = function() {
                    statusDiv.textContent = '[!] Failed to load image';
                    statusDiv.style.color = '#f87171';
                };
                
                img.src = e.target.result;
            };
            
            reader.onerror = function() {
                statusDiv.textContent = '[!] Error reading file';
                statusDiv.style.color = '#f87171';
            };
            
            reader.readAsDataURL(file);
        }
        
        // Process a loaded image with current sampling settings
        // Downscales large images for faster processing
        function processImageWithSettings(img, statusDiv) {
            // Create temporary canvas to sample from image
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            
            // Calculate optimal processing size - downscale large images for faster processing
            const maxProcessingSize = 400; // Max dimension for processing
            let processWidth = img.width;
            let processHeight = img.height;
            
            // Downscale if image is larger than max processing size
            if (img.width > maxProcessingSize || img.height > maxProcessingSize) {
                const ratio = Math.min(maxProcessingSize / img.width, maxProcessingSize / img.height);
                processWidth = Math.round(img.width * ratio);
                processHeight = Math.round(img.height * ratio);
            }
            
            tempCanvas.width = processWidth;
            tempCanvas.height = processHeight;
            
            console.log(`Processing image: ${img.width}x${img.height} → ${processWidth}x${processHeight}`);
            
            // Draw image at processing size
            tempCtx.fillStyle = 'black';
            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            tempCtx.drawImage(img, 0, 0, processWidth, processHeight);
            
            // Process the sampled image - use scale of 1 since we work in downscaled space
            // The imageScale slider controls final rendering size
            processSampling(tempCanvas, tempCtx, 1, statusDiv);
        }
        
        // Reload current image or SVG with updated sampling settings
        // Called when user changes density, scale, or sampling mode
        function reloadImage() {
            // Update image scale from slider
            imageScale = parseFloat(document.getElementById('imageScale').value);
            
            const statusDiv = document.getElementById('svgStatus');
            
            if (currentInputType === 'image' && currentImageFile) {
                statusDiv.textContent = 'Reprocessing image...';
                statusDiv.style.color = '#facc15';
                
                const img = new Image();
                img.onload = function() {
                    processImageWithSettings(img, statusDiv);
                };
                img.src = currentImageFile;
            } else {
                // Reload SVG
                loadSVG();
            }
        }
        
        // Render SVG element to canvas and extract points
        // Converts SVG shapes to pixel data for sampling
        function sampleSVGPoints(svgElement, svgWidth, svgHeight, statusDiv) {
            const points = [];
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            
            // Set canvas size (use smaller size for sampling)
            const sampleScale = 2;
            tempCanvas.width = svgWidth * sampleScale;
            tempCanvas.height = svgHeight * sampleScale;
            
            // Clear the canvas
            tempCtx.fillStyle = 'rgba(0, 0, 0, 0)';
            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            
            // Ensure SVG has xmlns attribute
            if (!svgElement.hasAttribute('xmlns')) {
                svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            }
            
            // Convert SVG to properly encoded data URL
            const svgString = new XMLSerializer().serializeToString(svgElement);
            // Use encodeURIComponent for proper encoding
            const encodedSvg = encodeURIComponent(svgString);
            const svgDataUrl = 'data:image/svg+xml,' + encodedSvg;
            const img = new Image();
            
            img.onerror = function(error) {
                console.error('Image loading failed. Trying fallback method...');
                // Use a fallback - directly sample from the parsed SVG instead
                fallbackSample(svgElement, svgWidth, svgHeight, sampleScale, tempCanvas, tempCtx, statusDiv);
            };
            
            img.onload = function() {
                console.log('Image loaded successfully, size:', img.width, 'x', img.height);
                
                // Draw with black background to see white shapes
                tempCtx.fillStyle = 'black';
                tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
                
                processSampling(tempCanvas, tempCtx, sampleScale, statusDiv);
            };
            
            img.src = svgDataUrl;
        }
        
        // Fallback method for SVG sampling when image loading fails
        // Manually draws SVG shapes to canvas using Path2D
        function fallbackSample(svgElement, svgWidth, svgHeight, sampleScale, tempCanvas, tempCtx, statusDiv) {
            console.log('Using fallback sampling method');
            
            // Draw SVG shapes manually
            const shapes = svgElement.querySelectorAll('circle, rect, path, polygon, ellipse, line');
            
            tempCtx.fillStyle = 'white';
            tempCtx.strokeStyle = 'white';
            tempCtx.lineWidth = 2;
            tempCtx.scale(sampleScale, sampleScale);
            
            shapes.forEach(shape => {
                const tagName = shape.tagName.toLowerCase();
                
                if (tagName === 'circle') {
                    const cx = parseFloat(shape.getAttribute('cx'));
                    const cy = parseFloat(shape.getAttribute('cy'));
                    const r = parseFloat(shape.getAttribute('r'));
                    tempCtx.beginPath();
                    tempCtx.arc(cx, cy, r, 0, Math.PI * 2);
                    tempCtx.fill();
                } else if (tagName === 'rect') {
                    const x = parseFloat(shape.getAttribute('x')) || 0;
                    const y = parseFloat(shape.getAttribute('y')) || 0;
                    const w = parseFloat(shape.getAttribute('width'));
                    const h = parseFloat(shape.getAttribute('height'));
                    tempCtx.fillRect(x, y, w, h);
                } else if (tagName === 'polygon' || tagName === 'polyline') {
                    const points = shape.getAttribute('points');
                    if (points) {
                        const coords = points.trim().split(/\s+|,/).map(parseFloat);
                        tempCtx.beginPath();
                        for (let i = 0; i < coords.length; i += 2) {
                            if (i === 0) {
                                tempCtx.moveTo(coords[i], coords[i + 1]);
                            } else {
                                tempCtx.lineTo(coords[i], coords[i + 1]);
                            }
                        }
                        if (tagName === 'polygon') {
                            tempCtx.closePath();
                        }
                        tempCtx.fill();
                    }
                } else if (tagName === 'ellipse') {
                    const cx = parseFloat(shape.getAttribute('cx'));
                    const cy = parseFloat(shape.getAttribute('cy'));
                    const rx = parseFloat(shape.getAttribute('rx'));
                    const ry = parseFloat(shape.getAttribute('ry'));
                    tempCtx.beginPath();
                    tempCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                    tempCtx.fill();
                } else if (tagName === 'path') {
                    const d = shape.getAttribute('d');
                    if (d) {
                        const path = new Path2D(d);
                        tempCtx.fill(path);
                    }
                }
            });
            
            tempCtx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
            
            processSampling(tempCanvas, tempCtx, sampleScale, statusDiv);
        }
        
        // Core sampling function that extracts point positions from canvas pixel data
        // Supports two modes:
        // - Border mode: Only sample pixels on shape edges
        // - Fill mode: Sample all visible pixels at regular intervals
        function processSampling(tempCanvas, tempCtx, sampleScale, statusDiv) {
            const points = [];
            const samplingMode = document.getElementById('samplingMode').value;
            const step = parseInt(document.getElementById('borderDensity').value);
            
            // Sample pixels
            const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            const data = imageData.data;
            
            console.log('Sampling mode:', samplingMode, 'Step:', step);
            
            // Helper function to get pixel color
            function getPixelColor(x, y) {
                if (x < 0 || x >= tempCanvas.width || y < 0 || y >= tempCanvas.height) return null;
                const index = (y * tempCanvas.width + x) * 4;
                const r = data[index];
                const g = data[index + 1];
                const b = data[index + 2];
                const alpha = data[index + 3];
                return { r, g, b, alpha };
            }
            
            // Helper function to check if pixel is white/visible
            function isWhite(x, y) {
                const color = getPixelColor(x, y);
                if (!color) return false;
                return (color.r > 128 || color.g > 128 || color.b > 128) && color.alpha > 128;
            }
            
            if (samplingMode === 'border') {
                // BORDER MODE: Find edges of shapes and sample along the contour
                // Algorithm:
                // 1. Find all border pixels (pixels that touch a transparent pixel)
                // 2. Sort by angle from center to create ordered contour
                // 3. Sample at regular intervals along the perimeter
                
                const borderPixels = [];
                
                // Step 1: Find a starting point by scanning for first visible pixel
                let startX = -1, startY = -1;
                outer: for (let y = 0; y < tempCanvas.height; y++) {
                    for (let x = 0; x < tempCanvas.width; x++) {
                        if (isWhite(x, y)) {
                            startX = x;
                            startY = y;
                            break outer;
                        }
                    }
                }
                
                if (startX >= 0) {
                    // Direction vectors for checking 4 neighbors
                    const dx = [1, 0, -1, 0];  // right, down, left, up
                    const dy = [0, 1, 0, -1];
                    
                    // Step 2: Find all border pixels by checking each visible pixel
                    for (let py = 0; py < tempCanvas.height; py++) {
                        for (let px = 0; px < tempCanvas.width; px++) {
                            if (isWhite(px, py)) {
                                // A pixel is on the border if any neighbor is transparent
                                let isBorder = false;
                                for (let d = 0; d < 4; d++) {
                                    if (!isWhite(px + dx[d], py + dy[d])) {
                                        isBorder = true;
                                        break;
                                    }
                                }
                                if (isBorder) {
                                    borderPixels.push({ x: px, y: py });
                                }
                            }
                        }
                    }
                    
                    // Step 3: Calculate center of mass for angle-based sorting
                    let cx = 0, cy = 0;
                    borderPixels.forEach(p => { cx += p.x; cy += p.y; });
                    cx /= borderPixels.length;
                    cy /= borderPixels.length;
                    
                    // Step 4: Sort border pixels by angle from center (creates ordered contour)
                    borderPixels.sort((a, b) => {
                        const angleA = Math.atan2(a.y - cy, a.x - cx);
                        const angleB = Math.atan2(b.y - cy, b.x - cx);
                        return angleA - angleB;
                    });
                    
                    // Step 5: Calculate total perimeter length for even spacing
                    let totalLength = 0;
                    for (let i = 0; i < borderPixels.length; i++) {
                        const next = (i + 1) % borderPixels.length;
                        const pdx = borderPixels[next].x - borderPixels[i].x;
                        const pdy = borderPixels[next].y - borderPixels[i].y;
                        totalLength += Math.sqrt(pdx * pdx + pdy * pdy);
                    }
                    
                    // Step 6: Sample at regular intervals based on step setting
                    const spacing = step * 3;  // Pixels between sample points
                    const numPoints = Math.max(10, Math.floor(totalLength / spacing));
                    
                    for (let i = 0; i < numPoints; i++) {
                        const idx = Math.floor((i / numPoints) * borderPixels.length);
                        const p = borderPixels[idx];
                        const color = getPixelColor(p.x, p.y);
                        points.push({
                            x: p.x / sampleScale,
                            y: p.y / sampleScale,
                            r: color ? color.r : 74,
                            g: color ? color.g : 222,
                            b: color ? color.b : 128
                        });
                    }
                    
                    console.log(`Border: ${borderPixels.length} pixels, ${points.length} sampled (spacing: ${spacing})`);
                }
            } else {
                // FILL MODE: Sample all visible pixels at regular grid intervals
                // Simpler than border mode - just scan in a grid pattern
                for (let y = 0; y < tempCanvas.height; y += step) {
                    for (let x = 0; x < tempCanvas.width; x += step) {
                        if (isWhite(x, y)) {
                            const color = getPixelColor(x, y);
                            points.push({
                                x: x / sampleScale,
                                y: y / sampleScale,
                                r: color ? color.r : 74,
                                g: color ? color.g : 222,
                                b: color ? color.b : 128
                            });
                        }
                    }
                }
            }
            
            svgPoints = points;
            
            // Update status
            if (statusDiv) {
                statusDiv.textContent = `[OK] ${points.length} points ready`;
                statusDiv.style.color = '#4ade80';
            }
            
            console.log(`SVG processed: ${points.length} points extracted, sample:`, points.slice(0, 3));
            
            // Apply extrusion/projections (this handles particle creation with all settings)
            if (points.length > 0) {
                applyExtrusion();
            }
        }
        
        // Create particles from loaded SVG point data
        // Centers the shape on the canvas and applies scaling
        function autoAddParticlesFromSVG() {
            // Clear existing particles
            particles.length = 0;
            
            const layer = parseInt(document.getElementById('layer').value);
            
            // Add a particle for each SVG point
            for (let i = 0; i < svgPoints.length; i++) {
                const point = svgPoints[i];
                const centerX = canvas.width / 2;
                const centerY = canvas.height / 2;
                
                // Center the SVG on the canvas
                const svgCenterX = svgPoints.reduce((sum, p) => sum + p.x, 0) / svgPoints.length;
                const svgCenterY = svgPoints.reduce((sum, p) => sum + p.y, 0) / svgPoints.length;
                
                const targetX = centerX + (point.x - svgCenterX) * 3 * imageScale; // Scale up
                const targetY = centerY + (point.y - svgCenterY) * 3 * imageScale;
                
                const particle = new Particle(targetX, targetY, layer, targetX, targetY);
                // Set color from sampled point if available
                if (point.r !== undefined) {
                    particle.sourceR = point.r;
                    particle.sourceG = point.g;
                    particle.sourceB = point.b;
                }
                particles.push(particle);
            }
            
            updateCount();
            console.log(`Auto-added ${particles.length} particles from SVG`);
        }
        
        // Check if a pixel is on the edge of a shape
        // Returns true if any neighboring pixel is transparent
        function isEdgePixel(x, y, width, height, data) {
            // Check neighboring pixels
            const neighbors = [
                [-1, 0], [1, 0],  // left, right
                [0, -1], [0, 1],  // up, down
                [-1, -1], [-1, 1], [1, -1], [1, 1]  // diagonals
            ];
            
            for (const [dx, dy] of neighbors) {
                const nx = x + dx;
                const ny = y + dy;
                
                // Skip if out of bounds
                if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
                    return true; // Edge of canvas is a border
                }
                
                const neighborIndex = (ny * width + nx) * 4;
                const neighborAlpha = data[neighborIndex + 3];
                
                // If neighbor is transparent, this is a border pixel
                if (neighborAlpha < 128) {
                    return true;
                }
            }
            
            return false;
        }
        
        
        // ============================================================================
        // SECTION 9: UI CONTROL FUNCTIONS
        // ============================================================================
        // Functions for handling UI interactions and control panel behavior
        // ============================================================================
        
        // Toggle visibility of a collapsible section in the control panel
        function toggleSection(event) {
            const header = event.currentTarget;
            const content = header.nextElementSibling;
            const toggle = header.querySelector('.section-toggle');
            
            content.classList.toggle('collapsed');
            toggle.classList.toggle('collapsed');
        }
        
        // Toggle between animated and static rotation modes
        // Animated: rotation accumulates over time
        // Static: sliders control exact rotation angles
        function toggleAnimation() {
            const checkbox = document.getElementById('animateRotation');
            animationEnabled = checkbox.checked;
            
            // Update unit labels
            const rotXUnit = document.getElementById('rotXUnit');
            const rotYUnit = document.getElementById('rotYUnit');
            const rotZUnit = document.getElementById('rotZUnit');
            
            if (animationEnabled) {
                rotXUnit.textContent = '/s';
                rotYUnit.textContent = '/s';
                rotZUnit.textContent = '/s';
            } else {
                rotXUnit.textContent = '';
                rotYUnit.textContent = '';
                rotZUnit.textContent = '';
            }
            
            console.log('Animation:', animationEnabled ? 'enabled' : 'disabled');
        }
        
        // Toggle hover rotation mode
        // When enabled, mouse position controls rotation angles
        function toggleHoverRotate() {
            const checkbox = document.getElementById('hoverRotate');
            hoverRotateEnabled = checkbox.checked;
            // Cache hover max for faster lookups during mousemove
            lastHoverMaxCache = parseFloat(document.getElementById('hoverMax').value);
            console.log('Hover rotate:', hoverRotateEnabled ? 'enabled' : 'disabled');
        }
        
        // Update cached hover max value when slider changes
        document.addEventListener('DOMContentLoaded', function() {
            document.getElementById('hoverMax').addEventListener('change', function() {
                lastHoverMaxCache = parseFloat(this.value);
            });
        });
        
        // Initialize rotation angles from slider values on page load
        function initializeRotation() {
            staticRotX = parseFloat(document.getElementById('rotX').value) * Math.PI / 180;
            staticRotY = parseFloat(document.getElementById('rotY').value) * Math.PI / 180;
            staticRotZ = parseFloat(document.getElementById('rotZ').value) * Math.PI / 180;
            // Force update all particles with the initial rotation
            particles.forEach(p => p.update());
        }
        
        // Handle manual rotation slider changes (when animation is disabled)
        function onRotationChange() {
            if (!animationEnabled) {
                // Update static rotation angles when sliders change
                staticRotX = parseFloat(document.getElementById('rotX').value) * Math.PI / 180;
                staticRotY = parseFloat(document.getElementById('rotY').value) * Math.PI / 180;
                staticRotZ = parseFloat(document.getElementById('rotZ').value) * Math.PI / 180;
            }
        }
        
        
        // ============================================================================
        // SECTION 10: INITIALIZATION
        // ============================================================================
        // Default SVG and startup initialization
        // ============================================================================
        
        // Load a default SVG on page load for demonstration
        document.getElementById('svgInput').value = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 124 124" fill="none">
<rect width="124" height="124" rx="24" fill="#F97316"/>
<path d="M19.375 36.7818V100.625C19.375 102.834 21.1659 104.625 23.375 104.625H87.2181C90.7818 104.625 92.5664 100.316 90.0466 97.7966L26.2034 33.9534C23.6836 31.4336 19.375 33.2182 19.375 36.7818Z" fill="white"/>
<circle cx="63.2109" cy="37.5391" r="18.1641" fill="black"/>
<rect opacity="0.4" x="81.1328" y="80.7198" width="17.5687" height="17.3876" rx="4" transform="rotate(-45 81.1328 80.7198)" fill="#FDBA74"/>
</svg>`;
        
        // Initialize on page load after short delay to ensure DOM is ready
        setTimeout(() => {
            toggleAnimation();     // Set initial animation state
            toggleHoverRotate();   // Set initial hover rotate state
            initializeRotation();  // Initialize rotation angles
            loadSVG();             // Load and render default SVG
        }, 100);
        
        
        // ============================================================================
        // SECTION 11: PERFORMANCE MONITORING
        // ============================================================================
        // Debug panel for tracking FPS, frame times, and detecting performance issues
        // ============================================================================
        
        
        // ============================================================================
        // SECTION 12: MAIN ANIMATION LOOP
        // ============================================================================
        // The core rendering loop that updates and draws all particles every frame
        // ============================================================================
        
        // Main animation loop - called every frame via requestAnimationFrame
        // Parameter: currentTime - timestamp from requestAnimationFrame
        function animate(currentTime) {
            // Increment animation time
            animTime++;
            
            // Performance monitoring
            let frameStartTime = performance.now();
            
            // Update cached draw options periodically (every ~100ms)
            if (currentTime - lastDrawCacheUpdate > 100) {
                drawCache.wireframeEnabled = document.getElementById('wireframe').checked;
                lastDrawCacheUpdate = currentTime;
            }
            
            // Calculate FPS (throttled update)
            if (lastTime) {
                const delta = currentTime - lastTime;
                fps = Math.round(1000 / delta);
                
                // Track frame time for performance monitoring
                if (perfEnabled) {
                    frameTimes.push(delta);
                    if (frameTimes.length > perfBufferSize) {
                        frameTimes.shift();
                    }
                    if (delta > jankThreshold) {
                        jankCount++;
                    }
                }
                
                // Only update DOM every 500ms to reduce reflow pressure
                if (Math.floor(currentTime) % 500 < 16) {
                    document.getElementById('fps').textContent = fps;
                }
            }
            lastTime = currentTime;
            
            // Clear canvas
            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Update morph progress if morphing
            if (isMorphing) {
                morphProgress += morphSpeed;
                if (morphProgress >= 1) {
                    morphProgress = 1;
                    isMorphing = false;
                    
                    // Remove particles that were marked for removal (excess particles that merged)
                    const beforeCount = particles.length;
                    for (let i = particles.length - 1; i >= 0; i--) {
                        if (particles[i].markedForRemoval) {
                            particles.splice(i, 1);
                        }
                    }
                    if (particles.length !== beforeCount) {
                        updateCount();
                    }
                    
                    console.log('Morph complete');
                }
                
                // Update all particles with morph progress
                const pLen = particles.length;
                for (let i = 0; i < pLen; i++) {
                    particles[i].updateMorph(morphProgress);
                }
            }
            
            // Update all particles first (use for-loop for better performance)
            const pLen = particles.length;
            for (let i = 0; i < pLen; i++) {
                particles[i].update();
            }
            
            // Sort by depth (draw far points first, near points last)
            particles.sort((a, b) => a.currentZ - b.currentZ);
            
            // Calculate max Z efficiently (single pass, no intermediate array)
            let maxZ = 1;
            for (let i = 0; i < pLen; i++) {
                const absZ = Math.abs(particles[i].currentZ);
                if (absZ > maxZ) maxZ = absZ;
            }
            
            // Draw wireframe connections (only if enabled)
            if (drawCache.wireframeEnabled && wireframeConnections.length > 0) {
                ctx.strokeStyle = 'rgba(74, 222, 128, 0.15)';
                ctx.lineWidth = 0.5;
                const wLen = wireframeConnections.length;
                for (let i = 0; i < wLen; i++) {
                    const [idx1, idx2] = wireframeConnections[i];
                    const p1 = particles[idx1];
                    const p2 = particles[idx2];
                    if (p1 && p2) {
                        ctx.beginPath();
                        ctx.moveTo(p1.x, p1.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.stroke();
                    }
                }
            }
            
            // Draw particles (use for loop instead of forEach for better performance)
            for (let i = 0; i < pLen; i++) {
                particles[i].draw(maxZ);
            }
            
            // Update performance debug display
            if (perfEnabled && Math.floor(currentTime) % 100 < 16) {
                updatePerfDebugDisplay();
            }
            
            requestAnimationFrame(animate);
        }
        
        // Start the animation loop
        animate();
        
        
        // ============================================================================
        // SECTION 13: EVENT HANDLERS
        // ============================================================================
        // Mouse and keyboard event handling for interaction
        // ============================================================================

        // Right-click canvas to morph to next frame
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            morphToNextFrame();
        });
        
        // Mouse down handler - start drag operation
        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 2) return; // Ignore right-click for drag
            isDragging = true;
            dragMoved = false;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            canvas.style.cursor = 'grabbing';
        });

        // Mouse move handler - update hover rotation or drag particles
        window.addEventListener('mousemove', (e) => {
            // Update last mouse position for hover rotate
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            
            // Handle hover rotation when enabled
            if (hoverRotateEnabled && !animationEnabled) {
                const centerX = canvas.width / 2;
                const centerY = canvas.height / 2;
                
                // Calculate position relative to center
                const relX = e.clientX - centerX;
                const relY = e.clientY - centerY;
                
                // Calculate rotation based on position
                // Vertical position controls X rotation
                const rotXAmount = (relY / centerY) * lastHoverMaxCache;
                // Horizontal position controls Y rotation
                const rotYAmount = (relX / centerX) * lastHoverMaxCache;
                
                // Throttle DOM updates to avoid excessive reflows
                const now = performance.now();
                if (now - lastHoverUpdateTime > hoverUpdateThrottle) {
                    const rotXStr = rotXAmount.toFixed(1);
                    const rotYStr = rotYAmount.toFixed(1);
                    document.getElementById('rotX').value = -rotXStr;
                    document.getElementById('rotY').value = rotYStr;
                    document.getElementById('rotXValue').textContent = rotXStr;
                    document.getElementById('rotYValue').textContent = rotYStr;
                    lastHoverUpdateTime = now;
                }
                
                // Update rotation angles (converted to radians)
                staticRotX = -rotXAmount * Math.PI / 180;
                staticRotY = rotYAmount * Math.PI / 180;
                return; // Don't process drag when hover rotate is active
            }
            
            if (!isDragging) return;
            const dx = e.clientX - lastMouseX;
            const dy = e.clientY - lastMouseY;
            if (Math.abs(dx) + Math.abs(dy) > 1) dragMoved = true;

            if (animationEnabled) {
                // When animation is enabled: move particles
                const baseSizeVal = parseFloat(document.getElementById('size').value);
                particles.forEach(p => {
                    const sizeVal = p.displaySize || baseSizeVal;
                    const normalized = Math.min(1, sizeVal / Math.max(0.1, baseSizeVal));
                    const moveFactor = 0.12 + normalized * 0.88; // 0.12..1.0
                    p.baseX += dx * moveFactor;
                    p.baseY += dy * moveFactor;
                    // keep targetX/targetY in sync for SVG-anchored particles
                    if (p.hasTarget) {
                        p.targetX = p.baseX;
                        p.targetY = p.baseY;
                    }
                });
            }

            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
        });

        // Mouse up handler - end drag operation
        window.addEventListener('mouseup', (e) => {
            if (isDragging) {
                isDragging = false;
                canvas.style.cursor = 'default';
            }
        });
        
        // Arrow key handler - rotate manually when animation is disabled
        document.addEventListener('keydown', (e) => {
            if (!animationEnabled && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                
                const rotationStep = 5; // degrees per arrow press
                const rotXSlider = document.getElementById('rotX');
                const rotYSlider = document.getElementById('rotY');
                
                let newRotX = parseFloat(rotXSlider.value);
                let newRotY = parseFloat(rotYSlider.value);
                
                if (e.key === 'ArrowUp') {
                    newRotX = Math.max(-180, newRotX - rotationStep);
                } else if (e.key === 'ArrowDown') {
                    newRotX = Math.min(180, newRotX + rotationStep);
                } else if (e.key === 'ArrowLeft') {
                    newRotY = Math.max(-180, newRotY - rotationStep);
                } else if (e.key === 'ArrowRight') {
                    newRotY = Math.min(180, newRotY + rotationStep);
                }
                
                // Update sliders and display
                rotXSlider.value = newRotX;
                rotYSlider.value = newRotY;
                document.getElementById('rotXValue').textContent = newRotX;
                document.getElementById('rotYValue').textContent = newRotY;
                
                // Update rotation angles
                onRotationChange();
            }
        });
        
        // 'D' key handler - toggle control panel visibility
        document.addEventListener('keydown', (e) => {
            if (e.key === 'd' || e.key === 'D') {
                const controls = document.querySelector('.controls');
                controls.classList.toggle('hidden');
            }
        });
        
        
        // ============================================================================
        // SECTION 14: PERFORMANCE DEBUG FUNCTIONS
        // ============================================================================
        // Functions for the performance monitoring panel
        // ============================================================================
        
        // Toggle the performance debug panel on/off
        function togglePerfDebug() {
            const checkbox = document.getElementById('perfDebug');
            perfEnabled = checkbox.checked;
            const debugPanel = document.querySelector('.perf-debug');
            debugPanel.style.display = perfEnabled ? 'block' : 'none';
            if (perfEnabled) {
                frameTimes = [];
                jankCount = 0;
                longTaskCount = 0;
            }
            console.log('Performance debug:', perfEnabled ? 'enabled' : 'disabled');
        }
        
        // Update the performance debug panel with current statistics
        function updatePerfDebugDisplay() {
            if (!perfEnabled || frameTimes.length === 0) return;
            
            // Calculate statistics
            const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
            const maxFrameTime = Math.max(...frameTimes);
            const avgFps = Math.round(1000 / avgFrameTime);
            
            // Update text values
            document.getElementById('perfAvgFps').textContent = avgFps;
            document.getElementById('perfFrameTime').textContent = avgFrameTime.toFixed(1) + 'ms';
            document.getElementById('perfMaxFrame').textContent = maxFrameTime.toFixed(1) + 'ms';
            document.getElementById('perfJankCount').textContent = jankCount;
            
            // Memory info if available
            if (performance.memory) {
                const usedMB = (performance.memory.usedJSHeapSize / 1048576).toFixed(1);
                const limitMB = (performance.memory.jsHeapSizeLimit / 1048576).toFixed(1);
                document.getElementById('perfMemory').textContent = usedMB + ' / ' + limitMB + ' MB';
            }
            
            // Draw frame time chart
            const chart = document.getElementById('perfChart');
            if (chart && frameTimes.length > 0) {
                chart.innerHTML = '';
                const maxVal = Math.max(...frameTimes, jankThreshold * 2);
                const barWidth = Math.max(1, Math.floor(280 / frameTimes.length));
                
                frameTimes.forEach((time, idx) => {
                    const bar = document.createElement('div');
                    bar.className = 'perf-chart-bar' + (time > jankThreshold ? ' jank' : '');
                    const height = Math.max(2, (time / maxVal) * 40);
                    bar.style.height = height + 'px';
                    bar.style.left = (idx * barWidth) + 'px';
                    chart.appendChild(bar);
                });
            }
        }
        
        // Ctrl+Shift+D keyboard shortcut to toggle debug panel
        document.addEventListener('keydown', (e) => {
            if (e.key === 'D' && e.ctrlKey && e.shiftKey) {
                const checkbox = document.getElementById('perfDebug');
                checkbox.checked = !checkbox.checked;
                togglePerfDebug();
            }
        });
        
        
        // ============================================================================
        // STARTUP COMPLETE
        // ============================================================================
        
        console.log('3D Particle Visualization System Ready');
        console.log('Controls:');
        console.log('  - Right-click canvas to morph to next frame');
        console.log('  - Press D to toggle control panel');
        console.log('  - Press Ctrl+Shift+D for performance debug');
        console.log('  - Arrow keys rotate when animation is disabled');