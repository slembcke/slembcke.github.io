// Quick vertex shader to draw a light with.
// Just use a sprite in a real project, it makes the shape/gradient more flexible.
const LIGHT_VSHADER = (`
  attribute vec2 a_vertex;
  attribute vec2 a_uv;
  
  varying lowp vec2 v_uv;
  
  uniform mat4 u_matrix;

  void main(){
    gl_Position = u_matrix*vec4(a_vertex, 0, 1);
    gl_Position.x *= 0.75; // I'm too lazy to use a projection matrix here...
    v_uv = a_uv;
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

const SHADOW_VSHADER = (`
  attribute vec4 a_segment;
  attribute vec2 a_shadow_coord;
  
  uniform mat4 u_matrix;
  uniform vec3 u_light;
  
  varying vec4 v_penumbras;
  varying vec3 v_edges;
  varying vec3 v_pro_pos;
  varying vec4 v_endpoints;
  
  // Keep in mind this is GLSL code. You'll need to swap row/column for HLSL.
  mat2 adjugate(mat2 m){return mat2(m[1][1], -m[0][1], -m[1][0], m[0][0]);}
  mat2 inverse(mat2 m){return adjugate(m)/(m[0][0]*m[1][1] - m[0][1]*m[1][0]);}
  
  void main(){
    // Unpack the vertex shader input.
    vec2 endpoint_a = (u_matrix*vec4(a_segment.zw, 0.0, 1.0)).xy;
    vec2 endpoint_b = (u_matrix*vec4(a_segment.xy, 0.0, 1.0)).xy;
    vec2 endpoint = mix(endpoint_a, endpoint_b, a_shadow_coord.x);
    float light_radius = u_light.z;
    
    // Deltas from the segment to the light center.
    vec2 delta_a = endpoint_a - u_light.xy;
    vec2 delta_b = endpoint_b - u_light.xy;
    vec2 delta = endpoint - u_light.xy;
    
    // Offsets from the light center to the edge of the light volume.
    vec2 offset_a = vec2(-light_radius,  light_radius)*normalize(delta_a).yx;
    vec2 offset_b = vec2( light_radius, -light_radius)*normalize(delta_b).yx;
    vec2 offset = mix(offset_a, offset_b, a_shadow_coord.x);
    
    // Vertex projection.
    float w = a_shadow_coord.y;
    vec3 proj_pos = vec3(mix(delta - offset, endpoint, w), w);
    gl_Position = vec4(proj_pos.xy, 0, w);
    gl_Position.x *= 0.75; // I'm too lazy to use a projection matrix here...
    
    vec2 penumbra_a = adjugate(mat2( offset_a, -delta_a))*(delta - mix(offset, delta_a, w));
    vec2 penumbra_b = adjugate(mat2(-offset_b,  delta_b))*(delta - mix(offset, delta_b, w));
    v_penumbras = (light_radius > 0.0 ? vec4(penumbra_a, penumbra_b) : vec4(0, 1, 0, 1));

    // Edge values for light penetration and clipping.
    vec2 seg_delta = endpoint_b - endpoint_a;
    vec2 seg_normal = seg_delta.yx*vec2(-1.0, 1.0);
    v_edges.xy = inverse(mat2(seg_delta, delta_a + delta_b))*(delta - offset*(1.0 - w));
    v_edges.y *= 2.0;
    // Calculate a clipping coordinate that is 0 at the near edge (when w = 1)...
    // otherwise calculate the dot product with the projected coordinate.
    v_edges.z = dot(seg_normal, delta - offset)*(1.0 - w);

    // Light penetration values.
    float light_penetration = 0.01;
    v_pro_pos = vec3(proj_pos.xy, w*light_penetration);
    v_endpoints = vec4(endpoint_a, endpoint_b)/light_penetration;
  }
`);

const SHADOW_FSHADER = (`
  varying mediump vec4 v_penumbras;
  varying mediump vec3 v_edges;
  varying mediump vec3 v_pro_pos;
  varying mediump vec4 v_endpoints;
  
  void main(){
    // Light penetration.
    mediump float closest_t = clamp(v_edges.x/abs(v_edges.y), -0.5, 0.5) + 0.5;
    mediump vec2 closest_p = mix(v_endpoints.xy, v_endpoints.zw, closest_t);
    mediump vec2 penetration = closest_p - v_pro_pos.xy/v_pro_pos.z;
    mediump float bleed = min(dot(penetration, penetration), 1.0);

    // Penumbra mixing.
    mediump vec2 penumbras = smoothstep(-1.0, 1.0, v_penumbras.xz/v_penumbras.yw);
    mediump float penumbra = dot(penumbras, step(v_penumbras.yw, vec2(0.0)));
    penumbra -= 1.0/64.0; // Numerical precision fudge factor.
    
    gl_FragColor = vec4(bleed*(1.0 - penumbra)*step(v_edges.z, 0.0));
  }
`);

function main(){
  const canvas = document.querySelector('#glcanvas');
  const gl = canvas.getContext('webgl');

  if(!gl){
    alert('Unable to initialize WebGL. Your browser or machine may not support it.');
    return;
  }
  
  // Vertex format is {{a.x, a.y}, {b.x, b.y}, {s.x, s.y}} where:
  // 'a' is the first endpoint of a shadow casting segment.
  // 'b' is the seconnd endpoint
  // 's' is the shadow coordinate, and selects which corner
  // of the shadow quad this vertex corresponds to.
  // This makes for a fair amount of redundant vertex data.
  // Instancing will simplify packing the shadow data, but might be slower.
  
  // NOTE: I'm using non-indexed geometry here to avoid adding index
  // buffer code to an otherwise fairly minimal code example.
  // This is NOT at all ideal, and you should really prefer
  // indexed triangles or instancing in your own code.
  const shadow_verts = new Float32Array([
    -0.2, -0.1,  0.2, -0.1, 0.0, 0.0, // Vertex A
    -0.2, -0.1,  0.2, -0.1, 0.0, 1.0, // Vertex B
    -0.2, -0.1,  0.2, -0.1, 1.0, 1.0, // Vertex C
    -0.2, -0.1,  0.2, -0.1, 1.0, 1.0, // Vertex C
    -0.2, -0.1,  0.2, -0.1, 1.0, 0.0, // Vertex D
    -0.2, -0.1,  0.2, -0.1, 0.0, 0.0, // Vertex A

     0.2, -0.1,  0.2,  0.1, 0.0, 0.0,
     0.2, -0.1,  0.2,  0.1, 0.0, 1.0,
     0.2, -0.1,  0.2,  0.1, 1.0, 1.0,
     0.2, -0.1,  0.2,  0.1, 1.0, 1.0,
     0.2, -0.1,  0.2,  0.1, 1.0, 0.0,
     0.2, -0.1,  0.2,  0.1, 0.0, 0.0,

     0.2,  0.1, -0.2,  0.1, 0.0, 0.0,
     0.2,  0.1, -0.2,  0.1, 0.0, 1.0,
     0.2,  0.1, -0.2,  0.1, 1.0, 1.0,
     0.2,  0.1, -0.2,  0.1, 1.0, 1.0,
     0.2,  0.1, -0.2,  0.1, 1.0, 0.0,
     0.2,  0.1, -0.2,  0.1, 0.0, 0.0,

    -0.2,  0.1, -0.2, -0.1, 0.0, 0.0,
    -0.2,  0.1, -0.2, -0.1, 0.0, 1.0,
    -0.2,  0.1, -0.2, -0.1, 1.0, 1.0,
    -0.2,  0.1, -0.2, -0.1, 1.0, 1.0,
    -0.2,  0.1, -0.2, -0.1, 1.0, 0.0,
    -0.2,  0.1, -0.2, -0.1, 0.0, 0.0,
  ]);
  
  SHADOW_VERTEX_COUNT = shadow_verts.length/6;
  
  // This blend mode applies the shadow to the light, accumulates it, and resets the alpha.
  // The source color is multiplied by the destination alpha (where the shadow mask has been drawn).
  // The alpha src alpha replaces the destination alpha.
  // For the accumulate/clear trick to work your light must be opaque,
  // and cover the the whole drawable area (framebuffer or scissor rectangle)
  // TODO HDR clamp version
  const blend_light = {
    equation: {color: gl.FUNC_ADD, alpha: gl.FUNC_ADD},
    function: {color_src:gl.DST_ALPHA, color_dst:gl.ONE, alpha_src:gl.ONE, alpha_dst:gl.ZERO},
  };
  
  // Shadows should only be drawn into the alpha channel and should leave color untouched.
  // Unlike hard shadows that just black out the alpha, soft shadows are subtracted.
  const blend_shadow = {
    equation: {color: gl.FUNC_ADD, alpha: gl.FUNC_REVERSE_SUBTRACT},
    function: {color_src:gl.ZERO, color_dst:gl.ONE, alpha_src:gl.ONE, alpha_dst:gl.ONE},
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
      attrib_stride: 4*6, attribs: [
        {name: "a_segment", size: 4, offset: 4*0},
        {name: "a_shadow_coord", size: 2, offset: 4*4},
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
    // {x:-0.5, y:0.5, size: 100, radius: 0.4, color: [1, 1, 1]},
    {x:-1, y:-1, size: 2.5, radius: 0.2, color: [1, 1, 0]},
    {x: 1, y:-1, size: 2.5, radius: 0.2, color: [0, 1, 1]},
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
      {name: "u_light", type: UNIFORM.vec3, value: [light.x, light.y, light.radius]}
    ]);
    gl.drawArrays(gl.TRIANGLES, 0, SHADOW_VERTEX_COUNT);

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
