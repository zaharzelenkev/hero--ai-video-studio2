import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

(async () => {
  try {
    const ffmpeg = new FFmpeg();
    await ffmpeg.load();
    await ffmpeg.writeFile('test.jpg', await fetchFile('https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg'));
    
    console.log("Trying zoompan with in_time");
    let result = await ffmpeg.exec(['-loop', '1', '-t', '1', '-i', 'test.jpg', '-vf', "zoompan=z='(1+(1.15-1)*((in_time-0)/2.5))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1280x720:fps=30", 'out.mp4']);
    console.log("Result zoompan:", result);
    process.exit(0);
  } catch (e) {
    console.error("Error:", e);
    process.exit(1);
  }
})();
