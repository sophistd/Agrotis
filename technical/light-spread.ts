export const lightSources=[
 'https://science.nasa.gov/learn/basics-of-space-flight/chapter6-1/',
 'https://www.jpl.nasa.gov/edu/resources/lesson-plan/calculating-solar-power-in-space/',
];
export const lightConditions=[
 '固定光度，光源尺寸相对距离足够小，可近似点源，各向辐射均匀',
 '途中无吸收、散射和遮挡',
 '小接收面面积固定，始终正对光源；倾斜还需考虑投影面积',
 '各自起点归一为1；灯与太阳的绝对功率、距离与接收量并不相等',
 '不代表实测照度、肉眼明暗、地表日照、温度或当前行星实况',
];
export function lightSpread(distance:number) {
 if(!Number.isFinite(distance)||distance<1||distance>4)return null;
 return {distanceRatio:distance,sphereAreaRatio:distance*distance,irradianceRatio:1/(distance*distance)};
}
export function lightRatioLabel(distance:number) {
 const value=lightSpread(distance);if(!value)return '未知';
 const area=value.sphereAreaRatio;
 return Number.isInteger(area)?area===1?'1':`1/${area}`:`${(value.irradianceRatio*100).toFixed(1)}%`;
}
