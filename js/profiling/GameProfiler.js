export default class GameProfiler {
    constructor() {
        this.config = {
            minFrameTimeMs: 16.67, 
            minFunctionTimeMs: 0.1, 
            maxFramesToStore: 1000, 
            significantDigits: 3 
        };

        this.frameData = [];
        this.isRecording = false;
        this.frameThreshold = this.config.minFrameTimeMs; 
        this.currentFrame = null;
        this.memorySnapshots = [];
        this.functionStack = [];
        this.startTime = null;
        
        // Bind methods
        this.startFrame = this.startFrame.bind(this);
        this.endFrame = this.endFrame.bind(this);
        this.startFunction = this.startFunction.bind(this);
        this.endFunction = this.endFunction.bind(this);
    }

    startRecording() {
        this.isRecording = true;
        this.frameData = [];
        this.memorySnapshots = [];
        this.functionStack = [];
        this.startTime = performance.now();
        this.recordMemorySnapshot();
    }

    stopRecording() {
        this.isRecording = false;
        this.exportData();
    }

    startFrame() {
        this.currentFrame = {
            timestamp: performance.now(),
            totalTime: 0,
            functions: new Map(),
            memory: null
        };
    }

    endFrame() {
        if (!this.currentFrame) return;
        
        this.currentFrame.totalTime = performance.now() - this.currentFrame.timestamp;
        
        if (this.currentFrame.totalTime >= this.config.minFrameTimeMs) {
            this.frameData.push({
                timestamp: this.currentFrame.timestamp,
                totalTime: this.currentFrame.totalTime,
                functions: Object.fromEntries(this.currentFrame.functions),
                memory: this.currentFrame.memory
            });
            
            // Trim old frames 
            while (this.frameData.length > this.config.maxFramesToStore) {
                this.frameData.shift();
            }
        }
        
        this.currentFrame = null;
    }

    startFunction(name) {
        if (!this.currentFrame) return;
        
        const funcData = this.currentFrame.functions.get(name) || {
            totalTime: 0,
            timePerFrame: 0,
            callCount: 0,
            children: new Set(),
            parents: new Set(),
            startTime: 0
        };
        
        funcData.startTime = performance.now();
        funcData.callCount++;
        
        this.currentFrame.functions.set(name, funcData);
        this.functionStack.push(name);
    }

    endFunction(name) {
        if (!this.currentFrame) return;
        
        const endTime = performance.now();
        const funcData = this.currentFrame.functions.get(name);
        if (!funcData) return;
        
        const elapsed = endTime - funcData.startTime;
        funcData.totalTime += elapsed;
        funcData.timePerFrame = elapsed; 
        
        const stackIndex = this.functionStack.lastIndexOf(name);
        if (stackIndex > 0) {
            const parentName = this.functionStack[stackIndex - 1];
            const parentData = this.currentFrame.functions.get(parentName);
            if (parentData) {
                parentData.children.add(name);
                funcData.parents.add(parentName);
            }
        }
        
        this.functionStack.pop();
    }

    calculateSelfTime(node) {
        const childrenTime = node.children.reduce((sum, child) => {
            this.calculateSelfTime(child);
            return sum + child.totalTime;
        }, 0);
        
        node.selfTime = node.totalTime - childrenTime;
        
        // Update function stats if it's not the root frame node
        if (node.name !== 'frame' && this.currentFrame.functions[node.name]) {
            this.currentFrame.functions[node.name].selfTime = node.selfTime;
        }
        
        return node.selfTime;
    }

    getFunctionStats() {
        const stats = {};
        let frameIndex = 0;
        
        this.frameData.forEach(frame => {
            Object.entries(frame.functions).forEach(([funcName, data]) => {
                if (!stats[funcName]) {
                    stats[funcName] = {
                        totalTime: 0,
                        selfTime: 0,
                        totalCalls: 0,
                        averageTime: 0,
                        averageSelfTime: 0,
                        percentageOfFrame: 0,
                        percentageOfSelfFrame: 0,
                        minTime: Infinity,
                        maxTime: -Infinity,
                        timePerFrame: new Array(this.frameData.length).fill(0),
                        callsPerFrame: new Array(this.frameData.length).fill(0),
                        standardDeviation: 0,
                        children: new Set([...data.children]),
                        parents: new Set([...data.parents]),
                        callsPerParent: new Map() 
                    };
                }
                
                const timeThisFrame = data.timePerFrame;
                stats[funcName].totalTime += data.totalTime;
                stats[funcName].selfTime += data.selfTime;
                stats[funcName].totalCalls += data.callCount;
                stats[funcName].callsPerFrame[frameIndex] = data.callCount;
                stats[funcName].minTime = Math.min(stats[funcName].minTime, timeThisFrame);
                stats[funcName].maxTime = Math.max(stats[funcName].maxTime, timeThisFrame);
                stats[funcName].timePerFrame[frameIndex] = timeThisFrame;
                
                // Update calls per parent
                data.parents.forEach(parent => {
                    if (!stats[funcName].callsPerParent.has(parent)) {
                        stats[funcName].callsPerParent.set(parent, 1);
                    } else {
                        stats[funcName].callsPerParent.set(parent, stats[funcName].callsPerParent.get(parent) + 1);
                    }
                });
            });
            frameIndex++;
        });

        const totalFrameTime = this.frameData.reduce((acc, frame) => acc + frame.totalTime, 0);
        const totalFrames = this.frameData.length;
        
        Object.keys(stats).forEach(funcName => {
            const funcStats = stats[funcName];
            funcStats.averageTime = funcStats.totalTime / funcStats.totalCalls;
            funcStats.averageSelfTime = funcStats.selfTime / funcStats.totalCalls;
            funcStats.percentageOfFrame = (funcStats.totalTime / totalFrameTime) * 100;
            funcStats.percentageOfSelfFrame = (funcStats.selfTime / totalFrameTime) * 100;
            funcStats.averageCallsPerFrame = funcStats.totalCalls / totalFrames;
            
            funcStats.callsPerParent.forEach((stats, parent) => {
                stats.averageCallsPerFrame = stats / totalFrames;
            });
            
            const mean = funcStats.totalTime / totalFrames;
            const squaredDiffs = funcStats.timePerFrame.map(time => Math.pow(time - mean, 2));
            const avgSquaredDiff = squaredDiffs.reduce((acc, val) => acc + val, 0) / totalFrames;
            funcStats.standardDeviation = Math.sqrt(avgSquaredDiff);
            
            funcStats.children = Array.from(funcStats.children);
            funcStats.parents = Array.from(funcStats.parents);
        });

        return stats;
    }

    recordMemorySnapshot() {
        if (performance.memory) {
            this.memorySnapshots.push({
                timestamp: performance.now(),
                usedJSHeapSize: performance.memory.usedJSHeapSize,
                totalJSHeapSize: performance.memory.totalJSHeapSize,
                jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
            });
        }
    }

    exportData() {
        const processedFrameData = this.frameData.map(frame => {
            const processedFunctions = {};
            
            for (const [name, data] of Object.entries(frame.functions)) {
                if (data.totalTime >= this.config.minFunctionTimeMs) {
                    processedFunctions[name] = {
                        totalTime: Number(data.totalTime.toFixed(this.config.significantDigits)),
                        timePerFrame: Number(data.timePerFrame.toFixed(this.config.significantDigits)),
                        calls: data.callCount || 0,
                        children: Array.from(data.children || []),
                        parents: Array.from(data.parents || [])
                    };
                }
            }

            return {
                timestamp: frame.timestamp,
                totalTime: Number(frame.totalTime.toFixed(this.config.significantDigits)),
                functions: processedFunctions,
                memory: frame.memory || null
            };
        });

        const functionStats = {};
        for (const frame of processedFrameData) {
            for (const [name, data] of Object.entries(frame.functions)) {
                if (!functionStats[name]) {
                    functionStats[name] = {
                        totalTime: 0,
                        calls: 0,
                        timePerFrame: [],
                        children: new Set(),
                        parents: new Set()
                    };
                }
                functionStats[name].totalTime += data.totalTime;
                functionStats[name].calls += data.calls;
                functionStats[name].timePerFrame.push(data.timePerFrame);
                data.children.forEach(child => functionStats[name].children.add(child));
                data.parents.forEach(parent => functionStats[name].parents.add(parent));
            }
        }

        const processedFunctionStats = {};
        for (const [name, data] of Object.entries(functionStats)) {
            processedFunctionStats[name] = {
                totalTime: Number(data.totalTime.toFixed(this.config.significantDigits)),
                calls: data.calls,
                timePerFrame: data.timePerFrame.map(t => Number(t.toFixed(this.config.significantDigits))),
                averageTimePerFrame: Number((data.totalTime / processedFrameData.length).toFixed(this.config.significantDigits)),
                children: Array.from(data.children),
                parents: Array.from(data.parents)
            };
        }

        const memoryStats = this.frameData.map(frame => ({
            timestamp: frame.timestamp,
            used: frame.memory ? frame.memory.usedJSHeapSize : null,
            total: frame.memory ? frame.memory.totalJSHeapSize : null
        })).filter(stat => stat.used !== null);

        const data = {
            metadata: {
                startTime: this.startTime,
                endTime: performance.now(),
                totalFrames: processedFrameData.length,
                averageFrameTime: processedFrameData.reduce((sum, frame) => sum + frame.totalTime, 0) / processedFrameData.length,
                config: this.config
            },
            frameData: processedFrameData,
            functionStats: processedFunctionStats,
            memoryStats: memoryStats
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString();
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `profile_${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    getAverageFrameTime() {
        if (this.frameData.length === 0) return 0;
        const sum = this.frameData.reduce((acc, frame) => acc + frame.totalTime, 0);
        return sum / this.frameData.length;
    }

    getSlowFrames() {
        return this.frameData.filter(frame => frame.totalTime > this.config.minFrameTimeMs);
    }
}
