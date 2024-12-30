import Resource from './Resource.js';

export default class Gold extends Resource {
    constructor(initialAmount = 0) {
        super('Gold', 'G', initialAmount);
        this.basePerCrowdMember = 0.1; 
    }

    updateFromCrowd(crowdSize) {
        this.perSecond = crowdSize * this.basePerCrowdMember;
    }
}
