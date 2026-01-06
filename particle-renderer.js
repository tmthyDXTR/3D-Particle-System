/**
 * ParticleRenderer - Lightweight 3D particle animation module
 * Renders particle frames with rotation and morph animations
 * 
 * Usage:
 *   const renderer = new ParticleRenderer(canvas, { autoRotate: true });
 *   await renderer.loadFrames('frames.json');
 *   renderer.start();
 */
class ParticleRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.frames = [];
    this.currentFrame = 0;
    this.running = false;
    this.animTime = 0;
    
    // Options with defaults
    this.options = {
      autoRotate: options.autoRotate ?? true,
      rotateSpeed: options.rotateSpeed ?? 0.5,
      rotateX: options.rotateX ?? 0,
      rotateY: options.rotateY ?? 30,
      rotateZ: options.rotateZ ?? 0,
      particleSize: options.particleSize ?? 2,
      depthFog: options.depthFog ?? true,
      perspective: options.perspective ?? true,
      focalLength: options.focalLength ?? 800,
      morphSpeed: options.morphSpeed ?? 0.02,
      backgroundColor: options.backgroundColor ?? 'rgba(0,0,0,0.1)',
      scale: options.scale ?? 1,
      centerX: options.centerX ?? null,
      centerY: options.centerY ?? null,
      hoverRotate: options.hoverRotate ?? false,
      hoverMax: options.hoverMax ?? 45,
      ...options
    };
    
    this._boundAnimate = this._animate.bind(this);
    this._morphing = false;
    this._morphProgress = 0;
    this._staticRotX = 0;
    this._staticRotY = 0;
    this._staticRotZ = 0;
    
    if (this.options.hoverRotate) {
      this._setupHoverRotate();
    }
  }

  // Load frames from JSON file or object
  async loadFrames(source) {
    let data;
    if (typeof source === 'string') {
      const response = await fetch(source);
      data = await response.json();
    } else {
      data = source;
    }
    
    // Handle both single frame and multi-frame formats
    if (data.frame) {
      this.frames = [this._normalizeFrame(data.frame)];
    } else if (data.frames) {
      this.frames = data.frames.map(f => this._normalizeFrame(f));
    } else if (Array.isArray(data)) {
      this.frames = data.map(f => this._normalizeFrame(f));
    }
    
    if (this.frames.length > 0) {
      this._loadFrame(0);
    }
    return this;
  }

  // Load a single frame directly from points array
  loadPoints(points) {
    this.frames = [{ points: points.map(p => ({
      x: p.x, y: p.y, z: p.z || 0,
      r: p.r ?? 74, g: p.g ?? 222, b: p.b ?? 128
    }))}];
    this._loadFrame(0);
    return this;
  }

  _normalizeFrame(frame) {
    return {
      name: frame.name || 'Frame',
      points: frame.points.map(p => ({
        x: p.x ?? p.targetX,
        y: p.y ?? p.targetY,
        z: p.z ?? p.baseZ ?? 0,
        r: p.r ?? 74,
        g: p.g ?? 222,
        b: p.b ?? 128
      }))
    };
  }

  _loadFrame(index) {
    const frame = this.frames[index];
    if (!frame) return;
    
    const centerX = this.options.centerX ?? this.canvas.width / 2;
    const centerY = this.options.centerY ?? this.canvas.height / 2;
    const scale = this.options.scale;
    
    // Calculate frame center for proper centering
    const pts = frame.points;
    const fcx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const fcy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    
    this.particles = pts.map(p => ({
      baseX: centerX + (p.x - fcx) * scale,
      baseY: centerY + (p.y - fcy) * scale,
      baseZ: p.z * scale,
      x: 0, y: 0, z: 0,
      r: p.r, g: p.g, b: p.b,
      size: this.options.particleSize,
      opacity: 1,
      // Morph state
      morphStartX: 0, morphStartY: 0, morphStartZ: 0,
      morphTargetX: 0, morphTargetY: 0, morphTargetZ: 0,
      morphStartR: p.r, morphStartG: p.g, morphStartB: p.b,
      morphTargetR: p.r, morphTargetG: p.g, morphTargetB: p.b,
      remove: false
    }));
    
    this.currentFrame = index;
  }

  // Start animation loop
  start() {
    if (this.running) return this;
    this.running = true;
    this._lastTime = performance.now();
    requestAnimationFrame(this._boundAnimate);
    return this;
  }

  // Stop animation loop
  stop() {
    this.running = false;
    return this;
  }

  // Morph to next frame
  next() {
    if (this.frames.length < 2 || this._morphing) return this;
    const nextIndex = (this.currentFrame + 1) % this.frames.length;
    this._morphTo(nextIndex);
    return this;
  }

  // Morph to previous frame
  prev() {
    if (this.frames.length < 2 || this._morphing) return this;
    const prevIndex = (this.currentFrame - 1 + this.frames.length) % this.frames.length;
    this._morphTo(prevIndex);
    return this;
  }

  // Morph to specific frame index
  goTo(index) {
    if (index < 0 || index >= this.frames.length || this._morphing) return this;
    if (index === this.currentFrame) return this;
    this._morphTo(index);
    return this;
  }

  _morphTo(targetIndex) {
    const targetFrame = this.frames[targetIndex];
    const centerX = this.options.centerX ?? this.canvas.width / 2;
    const centerY = this.options.centerY ?? this.canvas.height / 2;
    const scale = this.options.scale;
    
    const pts = targetFrame.points;
    const fcx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const fcy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    
    const targetPoints = pts.map(p => ({
      x: centerX + (p.x - fcx) * scale,
      y: centerY + (p.y - fcy) * scale,
      z: p.z * scale,
      r: p.r, g: p.g, b: p.b
    }));
    
    // Add particles if needed
    while (this.particles.length < targetPoints.length) {
      const src = this.particles[Math.floor(Math.random() * this.particles.length)];
      this.particles.push({
        baseX: src.baseX, baseY: src.baseY, baseZ: src.baseZ,
        x: 0, y: 0, z: 0,
        r: src.r, g: src.g, b: src.b,
        size: this.options.particleSize, opacity: 1,
        morphStartX: 0, morphStartY: 0, morphStartZ: 0,
        morphTargetX: 0, morphTargetY: 0, morphTargetZ: 0,
        morphStartR: src.r, morphStartG: src.g, morphStartB: src.b,
        morphTargetR: src.r, morphTargetG: src.g, morphTargetB: src.b,
        remove: false
      });
    }
    
    // Set morph targets
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.morphStartX = p.baseX;
      p.morphStartY = p.baseY;
      p.morphStartZ = p.baseZ;
      p.morphStartR = p.r;
      p.morphStartG = p.g;
      p.morphStartB = p.b;
      
      if (i < targetPoints.length) {
        const t = targetPoints[i];
        p.morphTargetX = t.x;
        p.morphTargetY = t.y;
        p.morphTargetZ = t.z;
        p.morphTargetR = t.r;
        p.morphTargetG = t.g;
        p.morphTargetB = t.b;
        p.remove = false;
      } else {
        const t = targetPoints[Math.floor(Math.random() * targetPoints.length)];
        p.morphTargetX = t.x;
        p.morphTargetY = t.y;
        p.morphTargetZ = t.z;
        p.morphTargetR = t.r;
        p.morphTargetG = t.g;
        p.morphTargetB = t.b;
        p.remove = true;
      }
    }
    
    this._morphing = true;
    this._morphProgress = 0;
    this.currentFrame = targetIndex;
  }

  _setupHoverRotate() {
    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.options.hoverRotate) return;
      const rect = this.canvas.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const relX = (e.clientX - rect.left - cx) / cx;
      const relY = (e.clientY - rect.top - cy) / cy;
      const max = this.options.hoverMax * Math.PI / 180;
      this._staticRotX = -relY * max;
      this._staticRotY = relX * max;
    });
    
    this.canvas.addEventListener('mouseleave', () => {
      this._staticRotX = 0;
      this._staticRotY = 0;
    });
  }

  _animate(time) {
    if (!this.running) return;
    
    this.animTime++;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const centerX = this.options.centerX ?? w / 2;
    const centerY = this.options.centerY ?? h / 2;
    
    // Clear
    ctx.fillStyle = this.options.backgroundColor;
    ctx.fillRect(0, 0, w, h);
    
    // Update morph
    if (this._morphing) {
      this._morphProgress += this.options.morphSpeed;
      if (this._morphProgress >= 1) {
        this._morphProgress = 1;
        this._morphing = false;
        this.particles = this.particles.filter(p => !p.remove);
      }
      
      const ease = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
      const t = ease(this._morphProgress);
      
      for (const p of this.particles) {
        p.baseX = p.morphStartX + (p.morphTargetX - p.morphStartX) * t;
        p.baseY = p.morphStartY + (p.morphTargetY - p.morphStartY) * t;
        p.baseZ = p.morphStartZ + (p.morphTargetZ - p.morphStartZ) * t;
        p.r = Math.round(p.morphStartR + (p.morphTargetR - p.morphStartR) * t);
        p.g = Math.round(p.morphStartG + (p.morphTargetG - p.morphStartG) * t);
        p.b = Math.round(p.morphStartB + (p.morphTargetB - p.morphStartB) * t);
      }
    }
    
    // Calculate rotation
    let angleX, angleY, angleZ;
    if (this.options.hoverRotate) {
      angleX = this._staticRotX;
      angleY = this._staticRotY;
      angleZ = this._staticRotZ;
    } else if (this.options.autoRotate) {
      const t = this.animTime * this.options.rotateSpeed * 0.01;
      angleX = this.options.rotateX * Math.PI / 180 * t;
      angleY = this.options.rotateY * Math.PI / 180 * t;
      angleZ = this.options.rotateZ * Math.PI / 180 * t;
    } else {
      angleX = this.options.rotateX * Math.PI / 180;
      angleY = this.options.rotateY * Math.PI / 180;
      angleZ = this.options.rotateZ * Math.PI / 180;
    }
    
    // Transform particles
    for (const p of this.particles) {
      let x = p.baseX - centerX;
      let y = p.baseY - centerY;
      let z = p.baseZ;
      
      // Rotate X
      if (angleX !== 0) {
        const y1 = y * Math.cos(angleX) - z * Math.sin(angleX);
        const z1 = y * Math.sin(angleX) + z * Math.cos(angleX);
        y = y1; z = z1;
      }
      // Rotate Y
      if (angleY !== 0) {
        const x1 = x * Math.cos(angleY) + z * Math.sin(angleY);
        const z1 = -x * Math.sin(angleY) + z * Math.cos(angleY);
        x = x1; z = z1;
      }
      // Rotate Z
      if (angleZ !== 0) {
        const x1 = x * Math.cos(angleZ) - y * Math.sin(angleZ);
        const y1 = x * Math.sin(angleZ) + y * Math.cos(angleZ);
        x = x1; y = y1;
      }
      
      p.x = x + centerX;
      p.y = y + centerY;
      p.z = z;
    }
    
    // Sort by depth
    this.particles.sort((a, b) => a.z - b.z);
    
    // Calculate max Z for fog
    let maxZ = 1;
    for (const p of this.particles) {
      const az = Math.abs(p.z);
      if (az > maxZ) maxZ = az;
    }
    
    // Draw particles
    for (const p of this.particles) {
      let opacity = 1;
      if (this.options.depthFog && maxZ > 0) {
        const nz = (p.z + maxZ) / (2 * maxZ);
        opacity = Math.max(0.1, 0.2 + nz * nz * 0.8);
      }
      
      // Apply perspective projection if enabled
      let drawX = p.x;
      let drawY = p.y;
      if (this.options.perspective && maxZ > 0) {
        const focalLength = this.options.focalLength;
        const distance = focalLength - p.z;
        const perspectiveScale = focalLength / distance;
        const dx = p.x - centerX;
        const dy = p.y - centerY;
        drawX = centerX + dx * perspectiveScale;
        drawY = centerY + dy * perspectiveScale;
      }
      
      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${opacity})`;
      ctx.beginPath();
      ctx.arc(drawX, drawY, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    requestAnimationFrame(this._boundAnimate);
  }
  
  // Resize handler - call when canvas size changes
  resize() {
    if (this.frames.length > 0) {
      this._loadFrame(this.currentFrame);
    }
    return this;
  }
  
  // Update options at runtime
  setOptions(newOptions) {
    Object.assign(this.options, newOptions);
    if ('hoverRotate' in newOptions && newOptions.hoverRotate) {
      this._setupHoverRotate();
    }
    return this;
  }

  // Get current frame index
  get frameIndex() {
    return this.currentFrame;
  }

  // Get total frame count
  get frameCount() {
    return this.frames.length;
  }

  // Check if currently morphing
  get isMorphing() {
    return this._morphing;
  }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ParticleRenderer;
}