// Quick vertex shader to draw a light with.
// Just use a sprite in a real project, it makes the shape/gradient more flexible.
const LIGHT_VSHADER = (`
  attribute vec2 a_vertex;
  attribute vec2 a_uv;
  
  varying lowp vec2 v_uv;
  
  uniform mat4 u_matrix;

  void main(){
    gl_Position = u_matrix*vec4(a_vertex, 0, 1);
    v_uv = a_uv;
    
    // I'm too lazy to use a projection matrix here...
    gl_Position.x *= 0.75;
  }
`);

// Quick fragment shader to draw a light with.
// Just use a sprite in a real project, it makes the shape/gradient more flexible.
const LIGHT_FSHADER = (`
  varying lowp vec2 v_uv;
  
  uniform lowp vec3 u_color;
  
  void main(){
    // A nice radial gradient with quadratic falloff.
    lowp float brightness = max(0.0, 1.0 - pow(dot(v_uv, v_uv), 0.25));
    gl_FragColor = vec4(brightness*u_color, 1.0);
  }
`);

// Quick vertex buffer to draw a light with.
// Just use a sprite in a real project, it makes the shape/gradient more flexible.
const LIGHT_SPRITE_VERTS = new Float32Array([
   10,  10,  10,  10,
  -10,  10, -10,  10,
   10, -10,  10, -10,
  -10, -10, -10, -10,
]);

// The shadow projection magic happens here in the vertex shader.
const SHADOW_VSHADER = (`
  attribute vec3 a_vertex;
  
  uniform mat4 u_matrix;
  uniform vec2 u_light_position;

  void main(){
    // Transform the position.
    // If you are batching the shadow data, you can pre-apply the transform instead.
    highp vec2 position = (u_matrix*vec4(a_vertex.xy, 0.0, 1.0)).xy;
    
    // When a_vertex.z is 0, the vertex is on the near side of the shadow and is output as is.
    // When a_vertex.z is 1, the vertex is on the far side of the shadow as is projected to inifity.
    gl_Position = vec4(position - a_vertex.z*u_light_position, 0, 1.0 - a_vertex.z);
    
    // I'm too lazy to use a projection matrix here...
    gl_Position.x *= 0.75;
  }
`);

// The fragment shader just has to output black. Easy.
const SHADOW_FSHADER = `void main(){gl_FragColor = vec4(0.0);}`;

// This is a polyline outline of a rectangle.
// It will be transformed into shadow vertex data in main().
const SHADOW_POLYLINE = [
  {x: -0.2, y: -0.1},
  {x:  0.2, y: -0.1},
  {x:  0.2, y:  0.1},
  {x: -0.2, y:  0.1},
  {x: -0.2, y: -0.1},
];

function main(){
  const canvas = document.querySelector('#glcanvas');
  const gl = canvas.getContext('webgl');

  if(!gl){
    alert('Unable to initialize WebGL. Your browser or machine may not support it.');
    return;
  }
  
  // Convert the shadow polyline into a vertex buffer of shadow geometry.
  // Each vertex is output twice, one needs a z-value of 0.0, and the other 1.0.
  const shadow_verts = new Float32Array(6*SHADOW_POLYLINE.length);
  for(var i in SHADOW_POLYLINE){
    const v = SHADOW_POLYLINE[i];
    const idx = 6*i;
    
    // Output the first vertex. (x, y, z)
    shadow_verts[idx + 0] = v.x;
    shadow_verts[idx + 1] = v.y;
    shadow_verts[idx + 2] = 0.0;
    
    // Output the second vertex. (x, y, z)
    shadow_verts[idx + 3] = v.x;
    shadow_verts[idx + 4] = v.y;
    shadow_verts[idx + 5] = 1.0;
  }
  
  // This blend mode applies the shadow to the light, accumulates it, and resets the alpha.
  // The source color is multiplied by the destination alpha (where the shadow mask has been drawn).
  // The alpha src alpha replaces the destination alpha.
  // For the accumulate/clear trick to work your light must be opaque,
  // and cover the the whole drawable area (framebuffer or scissor rectangle)
  const blend_light = {
    equation: {color: gl.FUNC_ADD, alpha: gl.FUNC_ADD},
    function: {color_src:gl.DST_ALPHA, color_dst:gl.ONE, alpha_src:gl.ONE, alpha_dst:gl.ZERO},
  };
  
  // Shadows should only be drawn into the alpha channel and should leave color untouched.
  // You could also do this with a write mask if that's supported.
  const blend_shadow = {
    equation: {color: gl.FUNC_ADD, alpha: gl.FUNC_ADD},
    function: {color_src:gl.ZERO, color_dst:gl.ONE, alpha_src:gl.ZERO, alpha_dst:gl.ZERO},
  };
  
  // Bundle up all of rendering data we need...
  const ctx = {
    gl: gl,
    light_material: {
      shader: create_shader(gl, LIGHT_VSHADER, LIGHT_FSHADER),
      vbuffer: create_vbuffer(gl, LIGHT_SPRITE_VERTS),
      blend: blend_light,
      attrib_stride: 16, attribs: [
        {name: "a_vertex", size: 2, offset: 0},
        {name: "a_uv", size: 2, offset: 8},
      ],
    },
    shadow_material: {
      shader: create_shader(gl, SHADOW_VSHADER, SHADOW_FSHADER),
      vbuffer: create_vbuffer(gl, shadow_verts),
      blend: blend_shadow,
      attrib_stride: 12, attribs: [
        {name: "a_vertex", size: 3, offset: 0},
      ],
    },
  };
  
  // Start the drawing loop.
  function render_loop(time){
    draw(ctx, time*1e-3);
    requestAnimationFrame(render_loop);
  }
  
  requestAnimationFrame(render_loop);
}

function draw(ctx, time){
  const gl = ctx.gl;
  
  // Make sure to clear the alpha to 1.0 otherwise your first light won't show up!
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  
  // A list of the visible lights we want to draw.
  const lights = [
    {x:-1, y:-1, size: 2, color: [1, 1, 0]},
    {x: 1, y:-1, size: 2, color: [0, 1, 1]},
  ];
  
  // Animate the transform of the box that casts the shadow.
  const rectangle_transform = mat4_trs(0.3*Math.cos(time), 0.3*Math.sin(time), time, 1);
  
  for(var i in lights){
    const light = lights[i];
    
    // Draw the shadow mask into destination alpha.
    // You can skip the transform part if you batch the geometry or something.
    // However, the shadow shader does need the light's position to know where to project from.
    bind_material(gl, ctx.shadow_material, [
      {name: "u_matrix", type: UNIFORM.mat4, value: rectangle_transform},
      {name: "u_light_position", type: UNIFORM.vec2, value: [light.x, light.y]}
    ]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 2*SHADOW_POLYLINE.length);

    // This is my quick and dirty way of drawing a sprite for the lights.
    // Other than the blending mode, the implementation here is unimportant.
    bind_material(gl, ctx.light_material, [
      {name: "u_color", type: UNIFORM.vec3, value: light.color},
      {name: "u_matrix", type: UNIFORM.mat4, value: mat4_trs(light.x, light.y, 0, light.size)},
    ]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  
  // At this point the lightmap is complete.
  // To actually use it in a game, you'll need to render it offscreen or into a texture.
  // Then either multiply it over the scene, or read it in your sprite shaders and multiply there.
}

// ---------------------------------------------------------------------------------------
// The rest of the code is just boring WebGL stuff... It's simple, but not very efficient.
// No attempt is made to avoid cache anything or avoid redundant state changes.
// Also this is the first JS I've written in like 10 years, feel free to judge it. :p
function create_shader(gl, LIGHT_VSHADER, LIGHT_FSHADER) {
  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
      alert('Failed to compile shader: ' + gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    } else {
      return shader;
    }
  }
  
  const vshader = compile(gl, gl.VERTEX_SHADER, LIGHT_VSHADER);
  const fshader = compile(gl, gl.FRAGMENT_SHADER, LIGHT_FSHADER);

  const shader = gl.createProgram();
  gl.attachShader(shader, vshader);
  gl.attachShader(shader, fshader);
  gl.linkProgram(shader);

  if (!gl.getProgramParameter(shader, gl.LINK_STATUS)) {
    alert('Unable to initialize the shader shader: ' + gl.getProgramInfoLog(shader));
    gl.deleteShader(vshader);
    gl.deleteShader(fshader);
    gl.deleteProgram(shader);
    return null;
  } else {
    return shader;
  }
}

function create_vbuffer(gl, vertexes){
  const vbuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertexes, gl.STATIC_DRAW);
  
  return vbuffer;
}

function mat4_trs(x, y, rotate, scale){
  const c = scale*Math.cos(rotate);
  const s = scale*Math.sin(rotate);
  return [
    c, -s, 0, 0,
    s,  c, 0, 0,
    0,  0, 1, 0,
    x,  y, 0, 1,
  ];
}

const UNIFORM = {
  vec2: function(gl, loc, value){gl.uniform2fv(loc, value);},
  vec3: function(gl, loc, value){gl.uniform3fv(loc, value);},
  mat4: function(gl, loc, value){gl.uniformMatrix4fv(loc, false, value);},
};

function bind_material(gl, material, uniforms){
  if(material.blend){
    gl.enable(gl.BLEND);
    const blend = material.blend;
    gl.blendEquationSeparate(blend.equation.color, blend.equation.alpha);
    const func = blend.function;
    gl.blendFuncSeparate(func.color_src, func.color_dst, func.alpha_src, func.alpha_dst);
  } else {
    gl.disable(gl.BLEND);
  }
  
  gl.bindBuffer(gl.ARRAY_BUFFER, material.vbuffer);
  for(var i in material.attribs){
    const attrib = material.attribs[i];
    const loc = gl.getAttribLocation(material.shader, attrib.name);
    gl.vertexAttribPointer(loc, attrib.size, gl.FLOAT, false, material.attrib_stride, attrib.offset);
    gl.enableVertexAttribArray(loc);
  }
  
  gl.useProgram(material.shader);
  for(var i in uniforms){
    const uniform = uniforms[i];
    uniform.type(gl, gl.getUniformLocation(material.shader, uniform.name), uniform.value);
  }
}

main();
