import fs from 'fs';
import path from 'path';
import process from 'node:process';
import { Buffer } from 'node:buffer';

// Helper function to pause execution (Polite scraping)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const imagesToDownload = [
  // Historical
  { id: "einstein", img: "https://upload.wikimedia.org/wikipedia/commons/d/d3/Albert_Einstein_Head.jpg", name: "Albert Einstein" },
  { id: "tesla", img: "https://upload.wikimedia.org/wikipedia/commons/7/79/Tesla_circa_1890.jpeg", name: "Nikola Tesla" },
  { id: "feynman", img: "https://upload.wikimedia.org/wikipedia/en/4/42/Richard_Feynman_Nobel.jpg", name: "Richard Feynman" },
  { id: "curie", img: "https://upload.wikimedia.org/wikipedia/commons/c/c8/Marie_Curie_c._1920s.jpg", name: "Marie Curie" },
  { id: "darwin", img: "https://upload.wikimedia.org/wikipedia/commons/2/2e/Charles_Darwin_seated_crop.jpg", name: "Charles Darwin" },
  { id: "newton", img: "https://upload.wikimedia.org/wikipedia/commons/3/39/GodfreyKneller-IsaacNewton-1689.jpg", name: "Isaac Newton" },
  { id: "davinci", img: "https://upload.wikimedia.org/wikipedia/commons/b/ba/Leonardo_self.jpg", name: "Leonardo da Vinci" },
  { id: "kalam", img: "https://upload.wikimedia.org/wikipedia/commons/b/b0/A.P.J._Abdul_Kalam.jpg", name: "APJ Abdul Kalam" },
  { id: "lovelace", img: "https://upload.wikimedia.org/wikipedia/commons/a/a4/Ada_Lovelace_portrait.jpg", name: "Ada Lovelace" },
  { id: "turing", img: "https://upload.wikimedia.org/wikipedia/commons/a/a1/Alan_Turing_Aged_16.jpg", name: "Alan Turing" },
  { id: "oppenheimer", img: "https://upload.wikimedia.org/wikipedia/commons/0/03/JROppenheimer-LosAlamos.jpg", name: "Robert Oppenheimer" },
  { id: "hawking", img: "https://upload.wikimedia.org/wikipedia/commons/e/eb/Stephen_Hawking.StarChild.jpg", name: "Stephen Hawking" },
  { id: "galileo", img: "https://upload.wikimedia.org/wikipedia/commons/c/cc/Galileo.arp.300pix.jpg", name: "Galileo" },
  { id: "socrates", img: "https://upload.wikimedia.org/wikipedia/commons/a/a4/Socrates_Louvre.jpg", name: "Socrates" },
  { id: "aristotle", img: "https://upload.wikimedia.org/wikipedia/commons/a/ae/Aristotle_Altemps_Inv8575.jpg", name: "Aristotle" },
  { id: "marcus", img: "https://upload.wikimedia.org/wikipedia/commons/e/e0/Marcus_Aurelius_Louvre_MR561_n2.jpg", name: "Marcus Aurelius" },
  { id: "rumi", img: "https://upload.wikimedia.org/wikipedia/commons/1/14/Rumi_Vignette_by_User_Chyah.jpg", name: "Rumi" },
  { id: "gandhi", img: "https://upload.wikimedia.org/wikipedia/commons/7/7a/Mahatma-Gandhi%2C_studio%2C_1931.jpg", name: "Mahatma Gandhi" },
  { id: "lincoln", img: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Abraham_Lincoln_O-77_matte_collodion_print.jpg", name: "Abraham Lincoln" },
  { id: "mandela", img: "https://upload.wikimedia.org/wikipedia/commons/1/14/Nelson_Mandela-2008_%28edit%29.jpg", name: "Nelson Mandela" },
  { id: "cleopatra", img: "https://upload.wikimedia.org/wikipedia/commons/3/3e/Cleopatra_VII_Bust_Altes_Museum_Berlin.jpg", name: "Cleopatra" },
  { id: "caesar", img: "https://upload.wikimedia.org/wikipedia/commons/9/9b/Julius_Caesar_Coustou_Louvre_MR1798.jpg", name: "Julius Caesar" },
  { id: "suntzu", img: "https://upload.wikimedia.org/wikipedia/commons/1/1a/Sun_Tzu_-_Project_Gutenberg_eText_17405.jpg", name: "Sun Tzu" },
  { id: "shakespeare", img: "https://upload.wikimedia.org/wikipedia/commons/a/a2/Shakespeare.jpg", name: "William Shakespeare" },
  { id: "confucius", img: "https://upload.wikimedia.org/wikipedia/commons/b/b8/Confucius_Tang_Dynasty.jpg", name: "Confucius" },

  // Professional 
  { id: "doctor", img: "https://images.pexels.com/photos/5327656/pexels-photo-5327656.jpeg", name: "Doctor" },
  { id: "dev", img: "https://images.pexels.com/photos/1181675/pexels-photo-1181675.jpeg", name: "Developer" },
  { id: "gym", img: "https://images.pexels.com/photos/841130/pexels-photo-841130.jpeg", name: "Gym Coach" },
  { id: "lawyer", img: "https://images.pexels.com/photos/5668772/pexels-photo-5668772.jpeg", name: "Lawyer" },
  { id: "chef", img: "https://images.pexels.com/photos/3814446/pexels-photo-3814446.jpeg", name: "Chef" },
  { id: "finance", img: "https://images.pexels.com/photos/6801648/pexels-photo-6801648.jpeg", name: "Finance" },
  { id: "therapist", img: "https://images.pexels.com/photos/7176026/pexels-photo-7176026.jpeg", name: "Therapist" },
  { id: "mechanic", img: "https://images.pexels.com/photos/2244746/pexels-photo-2244746.jpeg", name: "Mechanic" },
  { id: "electrician", img: "https://images.pexels.com/photos/8853503/pexels-photo-8853503.jpeg", name: "Electrician" },
  { id: "founder", img: "https://images.pexels.com/photos/3183150/pexels-photo-3183150.jpeg", name: "Founder" },
  { id: "professor", img: "https://images.pexels.com/photos/5212345/pexels-photo-5212345.jpeg", name: "Professor" },
  { id: "data", img: "https://images.pexels.com/photos/574071/pexels-photo-574071.jpeg", name: "Data Scientist" },

  // Fictional
  { id: "sherlock", img: "https://upload.wikimedia.org/wikipedia/commons/c/c4/Sherlock_Holmes_Portrait_Paget.jpg", name: "Sherlock Holmes" },
  { id: "ironman", img: "https://upload.wikimedia.org/wikipedia/en/e/e0/Iron_Man_muscles.jpg", name: "Tony Stark" },
  { id: "hermione", img: "https://upload.wikimedia.org/wikipedia/en/d/d3/Hermione_Granger_poster.jpg", name: "Hermione Granger" },
  { id: "yoda", img: "https://upload.wikimedia.org/wikipedia/en/9/9b/Yoda_Empire_Strikes_Back.png", name: "Yoda" },
  { id: "tyrion", img: "https://upload.wikimedia.org/wikipedia/en/5/50/Tyrion_Lannister-Peter_Dinklage.jpg", name: "Tyrion Lannister" },
  { id: "hannibal", img: "https://upload.wikimedia.org/wikipedia/en/6/6e/Hannibal_Lecter_in_Silence_of_the_Lambs.jpg", name: "Hannibal Lecter" },
  { id: "spock", img: "https://upload.wikimedia.org/wikipedia/commons/c/c1/Nimoy_as_Spock.JPG", name: "Spock" },
  { id: "walter", img: "https://upload.wikimedia.org/wikipedia/en/0/03/Walter_White_S5B.png", name: "Walter White" }
];

const dir = path.join(process.cwd(), 'public', 'avatars');

if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
}

// Function to generate a fallback avatar if the download fails
async function generateFallback(p) {
  console.log(`⚠️  Falling back to UI-Avatar for ${p.id}...`);
  const safeName = encodeURIComponent(p.name);
  const fallbackUrl = `https://ui-avatars.com/api/?name=${safeName}&background=2E1A0D&color=fff&size=400`;
  
  const res = await fetch(fallbackUrl);
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const filePath = path.join(dir, `${p.id}.png`); // Fallbacks are always .png
  fs.writeFileSync(filePath, buffer);
  console.log(`✅ Saved Fallback: /avatars/${p.id}.png`);
}

async function downloadImages() {
  console.log(`Starting polite download for ${imagesToDownload.length} images. This will take about a minute...\n`);

  for (const p of imagesToDownload) {
    if (!p.img) continue;

    try {
      console.log(`Fetching ${p.id}...`);
      
      const res = await fetch(p.img, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        }
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      let ext = p.img.split('.').pop().split('?')[0];
      if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext.toLowerCase())) ext = 'jpg'; 

      const filePath = path.join(dir, `${p.id}.${ext}`);
      fs.writeFileSync(filePath, buffer);
      
      console.log(`✅ Saved: /avatars/${p.id}.${ext}`);
    } catch (err) {
      console.error(`❌ Main download failed (${err.message}).`);
      await generateFallback(p);
    }

    // Politeness delay: Wait 1.5 seconds before hitting the server again
    await sleep(1500);
  }
  
  console.log("\nDone bro. All 45 avatars are in your public/avatars folder. You can finally update Chat.jsx.");
}

downloadImages();
