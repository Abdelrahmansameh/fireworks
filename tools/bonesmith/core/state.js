export const state = {
    meshData: { parts: [], animations: {} },
    currentSkeletonId: '',
    currentSkeletonName: '',
    manifest: { skeletons: [] },
    
    selectedPartId: null,
    currentAnimId: '',
    currentTool: 'select',
    editorMode: 'skeleton',
    isPlaying: false,
    renamePending: false,
    currentTime: 0,
    lastTime: 0,
    selectedKeyframe: null,
    timelinePixelsPerSecond: 200,
    
    renderer: null,
    instancedGroup: null,
    canvas: null,
    
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    initialProp1: 0,
    initialProp2: 0,
    isPanning: false,
    panStartMouseX: 0,
    panStartMouseY: 0,
    panStartCameraX: 0,
    panStartCameraY: 0,
    
    CAMERA_MIN_ZOOM: 0.2,
    CAMERA_MAX_ZOOM: 200,
    MAX_UNDO_STATES: 50
};
