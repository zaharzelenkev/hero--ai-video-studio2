const { FFmpeg } = require('@ffmpeg/ffmpeg');
const { fetchFile } = require('@ffmpeg/util');

(async () => {
  const ffmpeg = new FFmpeg();
  await ffmpeg.load();
  await ffmpeg.writeFile('test.jpg', await fetchFile('https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg'));
  
  // Try with eval=frame
  console.log("Trying scale with eval=frame");
  let result = await ffmpeg.exec(['-loop', '1', '-t', '1', '-i', 'test.jpg', '-vf', "scale='iw*(1+0.1*t)':'ih*(1+0.1*t)':eval=frame", 'out1.mp4']);
  console.log("Result eval=frame:", result);
  
  console.log("Trying zoompan");
  result = await ffmpeg.exec(['-loop', '1', '-t', '1', '-i', 'test.jpg', '-vf', "zoompan=z='1+0.1*time':d=30", 'out2.mp4']);
  console.log("Result zoompan:", result);
  process.exit(0);
})();
