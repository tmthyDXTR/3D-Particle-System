# 3D Particle Visualization System

An interactive 3D particle system with frame morphing, built with vanilla JavaScript and Canvas. Create particle animations from images/SVGs and embed them in any website.

![Example Animation](docs/example.gif)

## Files

| File | Description |
|------|-------------|
| `particle-system.html` | Full editor with controls for creating particle frames |
| `docs/particle-renderer.js` | Lightweight module (~420 lines, nice) for embedding in projects |
| `docs/index.html` | Usage examples (cards, hover effects) |

## Quick Start

### Creating Frames (Editor)

1. Open `particle-system.html` in a browser
2. Upload an image or paste SVG code
3. Adjust settings (extrusion, rotation, colors)
4. Click "Add Current as Frame" to save
5. Repeat for multiple frames
6. Click "Export All Frames" to download JSON

### Embedding in Your Project

```html
<canvas id="myCanvas" width="400" height="300"></canvas>
<script src="particle-renderer.js"></script>
<script>
  const renderer = new ParticleRenderer(document.getElementById('myCanvas'), {
    autoRotate: true,
    hoverRotate: false,
    rotateY: 30,
    particleSize: 2,
    scale: 1,
    depthFog: true,
    morphSpeed: 0.02
  });

  renderer.loadFrames('my-frames.json').then(() => {
    renderer.start();
  });

  // Morph to next frame on click
  myCanvas.addEventListener('click', () => renderer.next());
</script>
```

## ParticleRenderer Options

| Option | Default | Description |
|--------|---------|-------------|
| `autoRotate` | `true` | Continuous rotation animation |
| `hoverRotate` | `false` | Mouse position controls rotation |
| `hoverMax` | `45` | Max rotation degrees for hover mode |
| `rotateX/Y/Z` | `0/30/0` | Rotation speed (auto) or angle (static) |
| `rotateSpeed` | `0.5` | Animation speed multiplier |
| `particleSize` | `2` | Base particle radius |
| `scale` | `1` | Scale factor for the entire animation |
| `depthFog` | `true` | Fade particles based on depth |
| `perspective` | `false` | Enable perspective projection |
| `focalLength` | `800` | Camera distance for perspective (higher = less distortion) |
| `morphSpeed` | `0.02` | Frame transition speed (0-1 per frame) |
| `backgroundColor` | `rgba(0,0,0,0.1)` | Canvas clear color |

## ParticleRenderer Methods

```javascript
renderer.start()           // Start animation loop
renderer.stop()            // Stop animation loop
renderer.next()            // Morph to next frame
renderer.prev()            // Morph to previous frame
renderer.goTo(index)       // Morph to specific frame
renderer.resize()          // Call after canvas resize
renderer.setOptions({...}) // Update options at runtime
renderer.loadPoints([...]) // Load points directly (no JSON)

// Properties
renderer.frameIndex        // Current frame index
renderer.frameCount        // Total frames loaded
renderer.isMorphing        // True during morph animation
```

## Frame JSON Format

```json
{
  "version": "1.0",
  "frames": [
    {
      "name": "Frame 1",
      "points": [
        { "x": 100, "y": 150, "z": 0, "r": 255, "g": 128, "b": 64 }
      ]
    }
  ]
}
```

## Examples

See `demo.html` for complete examples including:
- Full-screen hero with hover rotation
- Card grid with different configurations
- Click-to-morph interactions
