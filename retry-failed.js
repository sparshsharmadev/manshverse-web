import fs from 'fs';
import path from 'path';
import process from 'node:process';
import { Buffer } from 'node:buffer';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ONLY the 16 that failed, using Wikipedia's bulletproof Thumbnail CDN
const retryImages = [
  { id: "darwin", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Charles_Darwin_seated_crop.jpg/400px-Charles_Darwin_seated_crop.jpg" },
  { id: "davinci", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Leonardo_self.jpg/400px-Leonardo_self.jpg" },
  { id: "kalam", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/A.P.J._Abdul_Kalam.jpg/400px-A.P.J._Abdul_Kalam.jpg" },
  { id: "lovelace", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Ada_Lovelace_portrait.jpg/400px-Ada_Lovelace_portrait.jpg" },
  { id: "oppenheimer", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/JROppenheimer-LosAlamos.jpg/400px-JROppenheimer-LosAlamos.jpg" },
  { id: "galileo", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/Galileo.arp.300pix.jpg/400px-Galileo.arp.300pix.jpg" },
  { id: "aristotle", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Aristotle_Altemps_Inv8575.jpg/400px-Aristotle_Altemps_Inv8575.jpg" },
  { id: "marcus", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Marcus_Aurelius_Louvre_MR561_n2.jpg/400px-Marcus_Aurelius_Louvre_MR561_n2.jpg" },
  { id: "rumi", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Rumi_Poet.jpg/400px-Rumi_Poet.jpg" },
  { id: "cleopatra", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Cleopatra_VII_Bust_Altes_Museum_Berlin.jpg/400px-Cleopatra_VII_Bust_Altes_Museum_Berlin.jpg" },
  { id: "caesar", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Julius_Caesar_Coustou_Louvre_MR1798.jpg/400px-Julius_Caesar_Coustou_Louvre_MR1798.jpg" },
  { id: "suntzu", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Sun_Tzu_-_Project_Gutenberg_eText_17405.jpg/400px-Sun_Tzu_-_Project_Gutenberg_eText_17405.jpg" },
  { id: "confucius", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Confucius_Tang_Dynasty.jpg/400px-Confucius_Tang_Dynasty.jpg" },
  { id: "sherlock", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Sherlock_Holmes_Portrait_Paget.jpg/400px-Sherlock_Holmes_Portrait_Paget.jpg" },
  { id: "ironman", img: "https://upload.wikimedia.org/wikipedia/en/thumb/e/e0/Iron_Man_muscles.jpg/400px-Iron_Man_muscles.jpg" },
  { id: "spock", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Nimoy_as_Spock.JPG/400px-Nimoy_as_Spock.JPG" }
];

const dir = path.join(process.cwd(), 'public', 'avatars');

async function downloadRemaining() {
  console.log(`Retrying the 16 failed images...\n`);

  for (const p of retryImages) {
    try {
      console.log(`Fetching ${p.id}...`);
      
      const res = await fetch(p.img, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
        }
      });
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      const filePath = path.join(dir, `${p.id}.jpg`); // Forcing .jpg for these
      fs.writeFileSync(filePath, buffer);
      
      console.log(`✅ Success: /avatars/${p.id}.jpg`);
    } catch (err) {
      console.error(`❌ Still failed (${err.message}). The fallback PNG is still safe. `);
    }
    
    // 3 SECOND DELAY - Don't trigger the firewall again!
    await sleep(3000); 
  }
  
  console.log("\nDone bro. You have the real images now.");
}

downloadRemaining();
