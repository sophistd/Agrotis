import type {SoundMode} from './model';
export type Cue = 'approach'|'select'|'navigate'|'open'|'close'|'tick'|'confirm';
const pitches:Record<string,number>={earth:110,moon:146.83,meteors:82.41,comets:196};
export class Soundscape {
  private context?:AudioContext;
  private master?:GainNode;
  private mix?:GainNode;
  private wet?:GainNode;
  private ambience?:GainNode;
  private drones:OscillatorNode[]=[];
  private analyser?:AnalyserNode;
  private mode:SoundMode='off';
  private level=35;
  private body='moon';
  private unlocked=false;
  private activeVoices=0;
  private lastCue=0;
  readonly report={supported:typeof AudioContext!=='undefined',unlocked:false,state:'uninitialized',voices:0,cues:0,lastCue:'',ambience:false,rms:0};
  private create(){
    if(this.context||!this.report.supported)return;
    const ctx=this.context=new AudioContext({latencyHint:'interactive'}),master=this.master=ctx.createGain(),mix=this.mix=ctx.createGain();
    const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-26;compressor.knee.value=12;compressor.ratio.value=5;compressor.attack.value=.004;compressor.release.value=.16;
    mix.connect(compressor);compressor.connect(master);const analyser=this.analyser=ctx.createAnalyser();analyser.fftSize=256;master.connect(analyser);analyser.connect(ctx.destination);master.gain.value=0;
    const convolver=ctx.createConvolver(),impulse=ctx.createBuffer(2,Math.floor(ctx.sampleRate*1.1),ctx.sampleRate);let seed=704;
    for(let c=0;c<2;c++){const channel=impulse.getChannelData(c);for(let i=0;i<channel.length;i++){seed=(seed*16807)%2147483647;channel[i]=(seed/2147483647*2-1)*Math.pow(1-i/channel.length,3)*.18;}}
    convolver.buffer=impulse;const wet=this.wet=ctx.createGain();wet.gain.value=.12;wet.connect(convolver);convolver.connect(mix);
    const ambience=this.ambience=ctx.createGain();ambience.gain.value=0;ambience.connect(mix);
    for(const [ratio,gain] of [[1,.075],[1.5,.025],[2.002,.016]]){const osc=ctx.createOscillator(),amp=ctx.createGain();osc.type='sine';osc.frequency.value=(pitches[this.body]??110)*ratio;amp.gain.value=gain;osc.connect(amp);amp.connect(ambience);osc.start();this.drones.push(osc);}
    const noise=ctx.createBuffer(2,ctx.sampleRate*4,ctx.sampleRate);
    for(let c=0;c<2;c++){const data=noise.getChannelData(c);let low=0;for(let i=0;i<data.length;i++){seed=(seed*16807)%2147483647;low=(low+.025*(seed/2147483647*2-1))/1.025;data[i]=low;}}
    const grain=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),grainGain=ctx.createGain();grain.buffer=noise;grain.loop=true;filter.type='lowpass';filter.frequency.value=620;grainGain.gain.value=.12;grain.connect(filter);filter.connect(grainGain);grainGain.connect(ambience);grain.start();
    ctx.addEventListener('statechange',()=>{this.report.state=ctx.state;});this.report.state=ctx.state;
  }
  async unlock(){
    this.create();if(!this.context)return false;
    try {await this.context.resume();this.unlocked=this.context.state==='running';this.report.unlocked=this.unlocked;this.sync(this.mode,this.level,this.body);return this.unlocked;}catch{return false;}
  }
  sync(mode:SoundMode,level:number,body:string){
    this.mode=mode;this.level=level;this.body=body;
    const ctx=this.context;if(!ctx||!this.master)return;
    const now=ctx.currentTime,enabled=this.unlocked&&mode!=='off'&&!document.hidden;
    this.master.gain.setTargetAtTime(enabled?Math.min(100,Math.max(0,level))/100*.28:0,now,.035);
    this.ambience?.gain.setTargetAtTime(enabled&&mode==='ambient'?1:0,now,.28);
    const ratios=[1,1.5,2.002];this.drones.forEach((osc,i)=>osc.frequency.setTargetAtTime((pitches[body]??110)*ratios[i],now,.35));this.report.ambience=enabled&&mode==='ambient';if(mode==='off')window.setTimeout(()=>{if(this.mode==='off'&&ctx.state==='running')void ctx.suspend().catch(()=>{});},180);
  }
  cue(kind:Cue,pan=0,body=this.body){
    const ctx=this.context;if(!ctx||!this.mix||!this.wet||!this.unlocked||this.mode==='off'||document.hidden||ctx.state!=='running'||this.activeVoices>=10)return;
    if((kind==='tick'||kind==='approach')&&performance.now()-this.lastCue<90)return;this.lastCue=performance.now();
    const base=pitches[body]??146.83;
    const recipes:Record<Cue,[number,number,number,number,OscillatorType]>={approach:[base*4,base*3,.075,.045,'sine'],select:[base*2,base,.28,.15,'triangle'],navigate:[base*3,base*1.5,.2,.1,'sine'],open:[420,220,.17,.09,'triangle'],close:[220,160,.12,.07,'sine'],tick:[850,650,.04,.045,'sine'],confirm:[base*3,base*3,.12,.11,'sine']};
    const [start,end,length,volume,type]=recipes[kind];this.note(start,end,length,volume,type,pan,0);if(kind==='confirm')this.note(start*1.5,start*1.5,.16,.07,'sine',pan,.075);
    this.report.cues++;this.report.lastCue=kind;
  }
  private note(start:number,end:number,length:number,volume:number,type:OscillatorType,pan:number,delay:number){
    const ctx=this.context!,osc=ctx.createOscillator(),envelope=ctx.createGain(),panner=ctx.createStereoPanner(),now=ctx.currentTime+delay;
    osc.type=type;osc.frequency.setValueAtTime(start,now);osc.frequency.exponentialRampToValueAtTime(end,now+length);
    envelope.gain.setValueAtTime(.0001,now);envelope.gain.exponentialRampToValueAtTime(volume,now+.008);envelope.gain.exponentialRampToValueAtTime(.0001,now+length);
    panner.pan.value=Math.max(-.65,Math.min(.65,pan));osc.connect(envelope);envelope.connect(panner);panner.connect(this.mix!);panner.connect(this.wet!);this.activeVoices++;this.report.voices=this.activeVoices;
    osc.onended=()=>{osc.disconnect();envelope.disconnect();panner.disconnect();this.activeVoices--;this.report.voices=this.activeVoices;};osc.start(now);osc.stop(now+length+.03);
  }
  async visibility(){
    if(!this.context)return;if(document.hidden){this.report.ambience=false;await this.context.suspend();}else if(this.unlocked&&this.mode!=='off'){await this.context.resume();this.sync(this.mode,this.level,this.body);}
  }
  inspect(){
    if(this.analyser&&this.context?.state==='running'){const samples=new Float32Array(this.analyser.fftSize);this.analyser.getFloatTimeDomainData(samples);this.report.rms=Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length);}else this.report.rms=0;
    return {...this.report,mode:this.mode,level:this.level,body:this.body};
  }
  dispose(){void this.context?.close();}
}
