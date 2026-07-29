const fs = require('fs');

const extractGraph = () => {
    return `[0:v]fps=30,format=yuva420p,setpts=PTS-STARTPTS[c1];
[1:v]fps=30,format=yuva420p,setpts=PTS-STARTPTS[c2];
[c1]fps=30,settb=1/30,format=yuv420p[c1_tb];
[c2]fps=30,settb=1/30,format=yuv420p[c2_tb];
[c1_tb][c2_tb]xfade=transition=fade:duration=0.5:offset=0.5[out]`;
};

console.log(extractGraph());
