import sharp from "sharp";
import { writeFileSync } from "fs";

const svg = `
  <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <foreignObject x="0" y="0" width="1000" height="60">
      <div xmlns="http://www.w3.org/1999/xhtml" style="font-size: 24px; color: red;">
        Hello World
      </div>
    </foreignObject>
  </svg>
`;

async function run() {
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  writeFileSync("test_og.png", buf);
}
run();
