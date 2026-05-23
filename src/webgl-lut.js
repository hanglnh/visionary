export class WebGLLutFilter {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
    if (!this.gl) throw new Error("WebGL not supported");
    this.init();
  }

  init() {
    const gl = this.gl;
    
    const vsSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    const fsSource = `
      precision highp float;
      varying vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform sampler2D u_lut;

      void main() {
        vec4 color = texture2D(u_image, v_texCoord);
        
        // LUT size 512x512, 64 blocks of 64x64
        float blueColor = color.b * 63.0;
        
        vec2 quad1;
        quad1.y = floor(floor(blueColor) / 8.0);
        quad1.x = floor(blueColor) - (quad1.y * 8.0);
        
        vec2 quad2;
        quad2.y = floor(ceil(blueColor) / 8.0);
        quad2.x = ceil(blueColor) - (quad2.y * 8.0);
        
        vec2 texPos1;
        texPos1.x = (quad1.x * 0.125) + 0.5/512.0 + ((0.125 - 1.0/512.0) * color.r);
        texPos1.y = (quad1.y * 0.125) + 0.5/512.0 + ((0.125 - 1.0/512.0) * color.g);
        
        vec2 texPos2;
        texPos2.x = (quad2.x * 0.125) + 0.5/512.0 + ((0.125 - 1.0/512.0) * color.r);
        texPos2.y = (quad2.y * 0.125) + 0.5/512.0 + ((0.125 - 1.0/512.0) * color.g);
        
        vec4 newColor1 = texture2D(u_lut, texPos1);
        vec4 newColor2 = texture2D(u_lut, texPos2);
        
        vec4 finalColor = mix(newColor1, newColor2, fract(blueColor));
        
        gl_FragColor = vec4(finalColor.rgb, color.a);
      }
    `;

    const vertexShader = this.createShader(gl.VERTEX_SHADER, vsSource);
    const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fsSource);
    
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);
    
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(this.program));
      return;
    }
    
    gl.useProgram(this.program);
    
    // Geometry
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1.0, -1.0,  1.0, -1.0,  -1.0,  1.0,
      -1.0,  1.0,  1.0, -1.0,   1.0,  1.0
    ]), gl.STATIC_DRAW);
    
    const positionLocation = gl.getAttribLocation(this.program, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    
    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0.0, 1.0,  1.0, 1.0,  0.0, 0.0,
      0.0, 0.0,  1.0, 1.0,  1.0, 0.0
    ]), gl.STATIC_DRAW);
    
    const texCoordLocation = gl.getAttribLocation(this.program, "a_texCoord");
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

    this.imageTexture = gl.createTexture();
    this.lutTexture = gl.createTexture();
  }

  createShader(type, source) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error(this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  uploadTexture(texture, image, flipY = false) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  }

  render(imageObj, lutObj) {
    const gl = this.gl;
    
    this.canvas.width = imageObj.width;
    this.canvas.height = imageObj.height;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // Image texture - standard HTML images need flip Y because WebGL origin is bottom-left, 
    // but the geometry mapping already maps correctly (0,1 at top-left).
    // Actually, let's keep flipY false and rely on the texCoord buffer mapping.
    this.uploadTexture(this.imageTexture, imageObj, false);
    
    // LUT texture - should NOT flip Y, otherwise color lookup is inverted
    this.uploadTexture(this.lutTexture, lutObj, false);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    const u_image = gl.getUniformLocation(this.program, "u_image");
    gl.uniform1i(u_image, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTexture);
    const u_lut = gl.getUniformLocation(this.program, "u_lut");
    gl.uniform1i(u_lut, 1);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
