import json
import re
import os
from openai import OpenAI
import fitz
from dotenv import load_dotenv
load_dotenv()

PDF_PATH = "new_file.pdf"

MODEL_ID = "llama-3.3-70b-versatile" 

GROK_API_KEY = os.getenv("GROK_API_KEY")

client = OpenAI(
    api_key=GROK_API_KEY,
    base_url="https://api.groq.com/openai/v1",
)

def clean_text(text):
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text) 
    return text.strip()

def clean_json(text):
    text = re.sub(r"```json|```", "", text)
    return text.strip()

def extract_relevant_lines(text):
    lines = text.split("\n")
    legal_keywords = ["shall", "must", "permitted", "prohibited", "restricted", "no development"]
    spatial_keywords = ["meter", "meters", " m ", "height", "setback", "margin", "distance", "area", "road", "water", "zone"]

    filtered = []
    for line in lines:
        l = line.lower().strip()
        if len(l) < 40 or "...." in l: continue
        
        has_legal = any(k in l for k in legal_keywords)
        has_spatial = any(k in l for k in spatial_keywords)
        has_number = bool(re.search(r"\d+", l))

        if (has_legal or has_number) and has_spatial:
            filtered.append(line.strip())

    seen = set()
    unique = []
    for r in filtered:
        if r.lower()[:50] not in seen:
            unique.append(r)
            seen.add(r.lower()[:50])
    return "\n".join(unique)

def split_text(text, max_chars=3000):
    chunks = []
    current_chunk = ""
    for line in text.split("\n"):
        if len(current_chunk) + len(line) > max_chars:
            chunks.append(current_chunk.strip())
            current_chunk = line
        else:
            current_chunk += "\n" + line
    if current_chunk:
        chunks.append(current_chunk.strip())
    return chunks

def process_local_pdf(pdf_path):
    print(f"🚀 Processing: {pdf_path}")

    try:
        doc = fitz.open(pdf_path)
        raw_text = "\n".join([page.get_text("text") for page in doc])
        md_text = clean_text(raw_text)
        filtered_text = extract_relevant_lines(md_text)
        
        if not filtered_text:
            print("❌ No relevant spatial rules found in text.")
            return

        print(f"✅ Filtered Text Length: {len(filtered_text)} chars")
        
        chunks = split_text(filtered_text, max_chars=3000)
        all_rules = []

        for i, chunk in enumerate(chunks):
            print(f"🔹 Processing Chunk {i+1}/{len(chunks)}...")
            
            response = client.chat.completions.create(
                model=MODEL_ID,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an Urban Planning AI. Extract strictly SPATIAL/PHYSICAL rules. "
                            "Ignore administrative or financial text. "
                            "Return ONLY valid JSON in this format: "
                            '{ "rules": [ { "target_entity": "building", "reference_entity": "road", "spatial_relation": "min_distance", "threshold_value": 5, "threshold_unit": "meters" } ] }'
                        ),
                    },
                    {"role": "user", "content": chunk},
                ],
                temperature=0,
                response_format={"type": "json_object"},
            )

            raw_output = response.choices[0].message.content
            
            try:
                parsed = json.loads(clean_json(raw_output))
                chunk_rules = parsed.get("rules", [])
                all_rules.extend(chunk_rules)
                print(f"   ✅ Found {len(chunk_rules)} rules in this chunk.")
            except Exception as e:
                print(f"   ⚠️ Chunk {i+1} JSON parse failed: {e}")

        output_file = "extracted_compliance_rules.json"
        with open(output_file, "w") as f:
            json.dump({"rules": all_rules}, f, indent=2)

        print(f"\n🎉 SUCCESS!")
        print(f"📊 Total Rules Extracted: {len(all_rules)}")
        print(f"📁 Data saved to: {output_file}")
        
        return all_rules

    except Exception as e:
        print(f"❌ Pipeline Failed: {str(e)}")

if __name__ == "__main__":
    process_local_pdf(PDF_PATH)