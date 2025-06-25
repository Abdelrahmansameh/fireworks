class PhysicsShader {
    constructor(gl, maxParticles) {
        this.gl = gl;
        this.maxParticles = maxParticles;

        this.stateStride = 35; // Full particle state
        this.buffers = [gl.createBuffer(), gl.createBuffer()];
        for (const buf of this.buffers) {
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, this.stateStride * maxParticles * 4, gl.DYNAMIC_COPY);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        this.currentIndex = 0;
        this.transformFeedback = gl.createTransformFeedback();
        this._initProgram();
    }

    _initProgram() {
        const gl = this.gl;
        const vs = `#version 300 es
        // IN - Full particle state
        layout(location=0) in vec2 a_position;
        layout(location=1) in vec2 a_velocity;
        layout(location=2) in vec2 a_acceleration;
        layout(location=3) in vec4 a_color;
        layout(location=4) in float a_scale;
        layout(location=5) in float a_lifetime;
        layout(location=6) in float a_initialLifetime;
        layout(location=7) in float a_gravity;
        layout(location=8) in float a_rotation;
        layout(location=9) in float a_friction;
        layout(location=10) in float a_hasTrail;
        layout(location=11) in float a_trailLength;
        layout(location=12) in float a_trailWidth;
        layout(location=13) in float a_trailHeadIndex;
        layout(location=14) in float a_trailPointsCount;
        layout(location=15) in float a_trailGlowStrength;
        layout(location=16) in float a_trailBlurStrength;
        layout(location=17) in float a_enableColorGradient;
        layout(location=18) in vec4 a_originalColor;
        layout(location=19) in vec4 a_gradientFinalColor;
        layout(location=20) in float a_gradientStartTime;
        layout(location=21) in float a_gradientDuration;

        uniform float u_delta;
        uniform float u_verticalFrictionMultiplier;

        // OUT - Updated particle state (matches IN)
        out vec2 v_position;
        out vec2 v_velocity;
        out vec2 v_acceleration;
        out vec4 v_color;
        out float v_scale;
        out float v_lifetime;
        out float v_initialLifetime;
        out float v_gravity;
        out float v_rotation;
        out float v_friction;
        out float v_hasTrail;
        out float v_trailLength;
        out float v_trailWidth;
        out float v_trailHeadIndex;
        out float v_trailPointsCount;
        out float v_trailGlowStrength;
        out float v_trailBlurStrength;
        out float v_enableColorGradient;
        out vec4 v_originalColor;
        out vec4 v_gradientFinalColor;
        out float v_gradientStartTime;
        out float v_gradientDuration;

        void main() {
            // --- Physics Update ---
            vec2 velocity = a_velocity + a_acceleration * u_delta;
            velocity.y -= a_gravity * u_delta;

            float hf = 1.0 - a_friction * u_delta;
            float vf = 1.0 - a_friction * u_verticalFrictionMultiplier * u_delta;
            velocity.x *= hf;
            velocity.y *= vf;

            vec2 position = a_position + velocity * u_delta;
            float lifetime = a_lifetime - u_delta;

            // --- Passthrough ---
            v_position = position;
            v_velocity = velocity;
            v_acceleration = a_acceleration; // For now
            v_color = a_color; // Will be updated later
            v_scale = a_scale;
            v_lifetime = lifetime;
            v_initialLifetime = a_initialLifetime;
            v_gravity = a_gravity;
            v_rotation = a_rotation; // Should be updated based on velocity
            v_friction = a_friction;
            v_hasTrail = a_hasTrail;
            v_trailLength = a_trailLength;
            v_trailWidth = a_trailWidth;
            v_trailHeadIndex = a_trailHeadIndex;
            v_trailPointsCount = a_trailPointsCount;
            v_trailGlowStrength = a_trailGlowStrength;
            v_trailBlurStrength = a_trailBlurStrength;
            v_enableColorGradient = a_enableColorGradient;
            v_originalColor = a_originalColor;
            v_gradientFinalColor = a_gradientFinalColor;
            v_gradientStartTime = a_gradientStartTime;
            v_gradientDuration = a_gradientDuration;
        }`;

        const fs = `#version 300 es
        precision highp float;
        void main(){}
        `;

        const prog = gl.createProgram();
        const vsObj = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vsObj, vs);
        gl.compileShader(vsObj);
        if (!gl.getShaderParameter(vsObj, gl.COMPILE_STATUS)) {
            console.error('VS COMPILE ERROR:', gl.getShaderInfoLog(vsObj));
            return;
        }

        const fsObj = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fsObj, fs);
        gl.compileShader(fsObj);
        if (!gl.getShaderParameter(fsObj, gl.COMPILE_STATUS)) {
            console.error('FS COMPILE ERROR:', gl.getShaderInfoLog(fsObj));
            return;
        }

        gl.attachShader(prog, vsObj);
        gl.attachShader(prog, fsObj);

        const varyings = [
            'v_position', 'v_velocity', 'v_acceleration', 'v_color', 'v_scale',
            'v_lifetime', 'v_initialLifetime', 'v_gravity', 'v_rotation', 'v_friction',
            'v_hasTrail', 'v_trailLength', 'v_trailWidth', 'v_trailHeadIndex', 'v_trailPointsCount',
            'v_trailGlowStrength', 'v_trailBlurStrength', 'v_enableColorGradient',
            'v_originalColor', 'v_gradientFinalColor', 'v_gradientStartTime', 'v_gradientDuration'
        ];
        gl.transformFeedbackVaryings(prog, varyings, gl.INTERLEAVED_ATTRIBS);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error('LINK ERROR:', gl.getProgramInfoLog(prog));
            return;
        }

        this.program = prog;
        this.u_delta = gl.getUniformLocation(prog, 'u_delta');
        this.u_verticalFrictionMultiplier = gl.getUniformLocation(prog, 'u_verticalFrictionMultiplier');
    }

    setupVertexAttribs(buffer) {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        const stride = this.stateStride * 4;
        let offset = 0;

        const attrib = (loc, size) => {
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
            offset += size * 4;
        };

        attrib(0, 2);  // a_position
        attrib(1, 2);  // a_velocity
        attrib(2, 2);  // a_acceleration
        attrib(3, 4);  // a_color
        attrib(4, 1);  // a_scale
        attrib(5, 1);  // a_lifetime
        attrib(6, 1);  // a_initialLifetime
        attrib(7, 1);  // a_gravity
        attrib(8, 1);  // a_rotation
        attrib(9, 1);  // a_friction
        attrib(10, 1); // a_hasTrail
        attrib(11, 1); // a_trailLength
        attrib(12, 1); // a_trailWidth
        attrib(13, 1); // a_trailHeadIndex
        attrib(14, 1); // a_trailPointsCount
        attrib(15, 1); // a_trailGlowStrength
        attrib(16, 1); // a_trailBlurStrength
        attrib(17, 1); // a_enableColorGradient
        attrib(18, 4); // a_originalColor
        attrib(19, 4); // a_gradientFinalColor
        attrib(20, 1); // a_gradientStartTime
        attrib(21, 1); // a_gradientDuration

        gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }

    update(delta, stateArray, count, verticalFrictionMultiplier) {
        const gl = this.gl;
        if (count === 0) return;

        const src = this.buffers[this.currentIndex];
        const dst = this.buffers[1 - this.currentIndex];

        // Upload data to source buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, src);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, stateArray.subarray(0, count * this.stateStride));
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        // Setup shader
        gl.useProgram(this.program);
        gl.uniform1f(this.u_delta, delta);
        gl.uniform1f(this.u_verticalFrictionMultiplier, verticalFrictionMultiplier);

        // Setup transform feedback
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.transformFeedback);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, dst);

        // Setup input attributes
        this.setupVertexAttribs(src);

        // Run simulation
        gl.enable(gl.RASTERIZER_DISCARD);
        gl.beginTransformFeedback(gl.POINTS);
        gl.drawArrays(gl.POINTS, 0, count);
        gl.endTransformFeedback();
        gl.disable(gl.RASTERIZER_DISCARD);

        // Unbind
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);

        // Read back the data
        gl.bindBuffer(gl.ARRAY_BUFFER, dst);
        gl.getBufferSubData(gl.ARRAY_BUFFER, 0, stateArray.subarray(0, count * this.stateStride));
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        // Swap buffers
        this.currentIndex = 1 - this.currentIndex;
    }
}

export default PhysicsShader;