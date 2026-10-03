export type PixelPoint={x:number;y:number};
export type MeasurementCalibration={
 width:number;height:number;scaleBarMeters:number;scaleBarPixels:number;scaleBarPixelTolerance:number;
 startDate:string;endDate:string;
};
export type DisplacementMeasurement={
 pixelDistance:number;deltaPixels:PixelPoint;distanceMeters:number;intervalMeters:{min:number;max:number};
 elapsedDays:number;apparentMetersPerEarthYear:number;rateInterval:{min:number;max:number};
 uncertaintyScope:'picking-and-scale-only';registrationErrorMeters:null;
};
type ImageSize={width:number;height:number};
type ImageRect=PixelPoint&ImageSize;
const earthYearDays=365.25,dayMilliseconds=86_400_000;
const positive=(value:number)=>Number.isFinite(value)&&value>0;
const nonnegative=(value:number)=>Number.isFinite(value)&&value>=0;
const validSize=({width,height}:ImageSize)=>positive(width)&&positive(height);
const inside=(point:PixelPoint,size:ImageSize)=>nonnegative(point.x)&&nonnegative(point.y)&&point.x<=size.width&&point.y<=size.height;

// -- 日期是观测日，不由访问者时区改变时间间隔 -----------------
function utcDay(date:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
 const value=Date.parse(`${date}T00:00:00.000Z`);
 return Number.isFinite(value)&&new Date(value).toISOString().slice(0,10)===date?value:null;
}

export function measureDisplacement(from:PixelPoint,to:PixelPoint,calibration:MeasurementCalibration,pointTolerancePixels=1):DisplacementMeasurement|null{
 const {scaleBarMeters,scaleBarPixels,scaleBarPixelTolerance,startDate,endDate}=calibration;
 if(!validSize(calibration)||!inside(from,calibration)||!inside(to,calibration)||!positive(scaleBarMeters)||!positive(scaleBarPixels)
  ||scaleBarPixels>Math.hypot(calibration.width,calibration.height)||!nonnegative(scaleBarPixelTolerance)
  ||scaleBarPixelTolerance>=scaleBarPixels||!nonnegative(pointTolerancePixels))return null;
 const start=utcDay(startDate),end=utcDay(endDate);
 if(start===null||end===null||end<=start)return null;
 const elapsedDays=(end-start)/dayMilliseconds,deltaPixels={x:to.x-from.x,y:to.y-from.y};
 const pixelDistance=Math.hypot(deltaPixels.x,deltaPixels.y),distanceMeters=pixelDistance*(scaleBarMeters/scaleBarPixels);
 // 两个圆形点选容差的相对位移半径为2t；尺度分母的上下界反向传播。
 const intervalMeters={
  min:Math.max(0,pixelDistance-2*pointTolerancePixels)*(scaleBarMeters/(scaleBarPixels+scaleBarPixelTolerance)),
  max:(pixelDistance+2*pointTolerancePixels)*(scaleBarMeters/(scaleBarPixels-scaleBarPixelTolerance)),
 };
 const perYear=earthYearDays/elapsedDays,apparentMetersPerEarthYear=distanceMeters*perYear;
 const rateInterval={min:intervalMeters.min*perYear,max:intervalMeters.max*perYear};
 if(![pixelDistance,distanceMeters,intervalMeters.min,intervalMeters.max,elapsedDays,apparentMetersPerEarthYear,rateInterval.min,rateInterval.max].every(Number.isFinite))return null;
 return {pixelDistance,deltaPixels,distanceMeters,intervalMeters,elapsedDays,apparentMetersPerEarthYear,rateInterval,uncertaintyScope:'picking-and-scale-only',registrationErrorMeters:null};
}

// -- 调用方传真正图像内容矩形，留白与裁切容器不能充当影像 ------
export function imagePoint(clientX:number,clientY:number,rect:ImageRect,imageSize:ImageSize):PixelPoint|null{
 if(![clientX,clientY,rect.x,rect.y].every(Number.isFinite)||!validSize(rect)||!validSize(imageSize))return null;
 const offset={x:clientX-rect.x,y:clientY-rect.y};
 if(!inside(offset,rect))return null;
 const point={x:(offset.x/rect.width)*imageSize.width,y:(offset.y/rect.height)*imageSize.height};
 return inside(point,imageSize)?point:null;
}
