class PhysicsShader {
    constructor(gl, maxParticles) {
        this.gl = gl;
        this.maxParticles = maxParticles;

        this.stateStride = 8; // pos.xy, vel.xy, accel.xy, lifetime
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
        layout(location=0) in vec2 a_position;
        layout(location=1) in vec2 a_velocity;
        layout(location=2) in vec2 a_acceleration;
        layout(location=3) in float a_lifetime;

        uniform float u_delta;
        uniform float u_gravity;
        uniform float u_friction;

        out vec4 v_data1; // pos.xy, vel.xy
        out vec4 v_data2; // accel.xy, lifetime, padding

        void main() {
            vec2 vel = a_velocity + a_acceleration * u_delta;
            vel.y -= u_gravity * u_delta;
            vel *= (1.0 - u_friction * u_delta);
            vec2 pos = a_position + vel * u_delta;
            float life = a_lifetime - u_delta;

            v_data1 = vec4(pos, vel);
            v_data2 = vec4(a_acceleration, life, 0.0);
        }`;

        const fs = `#version 300 es
        void main(){}
        `;

        const prog = gl.createProgram();
        const vsObj = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vsObj, vs);
        gl.compileShader(vsObj);
        const fsObj = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fsObj, fs);
        gl.compileShader(fsObj);
        gl.attachShader(prog, vsObj);
        gl.attachShader(prog, fsObj);
        gl.transformFeedbackVaryings(prog, ['v_data1', 'v_data2'], gl.INTERLEAVED_ATTRIBS);
        gl.linkProgram(prog);
        this.program = prog;
        this.u_delta = gl.getUniformLocation(prog, 'u_delta');
        this.u_gravity = gl.getUniformLocation(prog, 'u_gravity');
        this.u_friction = gl.getUniformLocation(prog, 'u_friction');
    }

    update(delta, stateArray, count, gravity=0, friction=0) {
        const gl = this.gl;
        if (count === 0) return;
        
        const src = this.buffers[this.currentIndex];
        const dst = this.buffers[1 - this.currentIndex];

        // Prepare input data
        const input = new Float32Array(count * this.stateStride);
        for (let i = 0; i < count; i++) {
            const b = i * this.stateStride;
            const s = i * 35; // InstancedParticleSystem stride
            input[b+0] = stateArray[s + 0]; // pos x
            input[b+1] = stateArray[s + 1]; // pos y
            input[b+2] = stateArray[s + 2]; // vel x
            input[b+3] = stateArray[s + 3]; // vel y
            input[b+4] = stateArray[s + 4]; // accel x
            input[b+5] = stateArray[s + 5]; // accel y
            input[b+6] = stateArray[s + 12]; // lifetime
            input[b+7] = 0; // padding / unused
        }

        // Upload data to source buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, src);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, input);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        // Setup shader
        gl.useProgram(this.program);
        gl.uniform1f(this.u_delta, delta);
        gl.uniform1f(this.u_gravity, gravity);
        gl.uniform1f(this.u_friction, friction);

        // Setup transform feedback
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.transformFeedback);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, dst);
        
        // Setup vertex attributes
        gl.bindBuffer(gl.ARRAY_BUFFER, src);
        const stride = this.stateStride * 4;
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 2*4);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 4*4);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 6*4);

        // Execute transform feedback
        gl.enable(gl.RASTERIZER_DISCARD);
        gl.beginTransformFeedback(gl.POINTS);
        gl.drawArrays(gl.POINTS, 0, count);
        gl.endTransformFeedback();
        gl.disable(gl.RASTERIZER_DISCARD);

        // Cleanup bindings
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);

        // Read back results
        const outData = new Float32Array(count * this.stateStride);
        gl.bindBuffer(gl.ARRAY_BUFFER, dst);
        gl.getBufferSubData(gl.ARRAY_BUFFER, 0, outData);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        // Copy results back to state array
        for (let i = 0; i < count; i++) {
            const b = i * this.stateStride;
            const s = i * 35;
            stateArray[s + 0] = outData[b+0];
            stateArray[s + 1] = outData[b+1];
            stateArray[s + 2] = outData[b+2];
            stateArray[s + 3] = outData[b+3];
            stateArray[s + 4] = outData[b+4];
            stateArray[s + 5] = outData[b+5];
            stateArray[s + 12] = outData[b+6];
        }

        this.currentIndex = 1 - this.currentIndex;
    }
}

export default PhysicsShader;