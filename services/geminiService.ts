import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Person, Gender, TreeData } from '../types';

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const modelName = 'gemini-3-flash-preview';

export const generateBio = async (person: Person): Promise<string> => {
  const prompt = `
    Write a short, engaging biography (max 150 words) for a genealogy record.
    The tone should be respectful and historical.
    
    Details:
    Name: ${person.firstName} ${person.lastName}
    Gender: ${person.gender}
    Born: ${person.birthDate || 'Unknown'} at ${person.birthPlace || 'Unknown'}
    Died: ${person.deathDate || 'Unknown'} at ${person.deathPlace || 'Unknown'}
    
    If dates are missing, focus on the name and legacy. Avoid making up specific facts not provided, but you can add general historical context if the date is provided.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
    });
    return response.text || "Could not generate biography.";
  } catch (error) {
    console.error("Gemini Bio Error:", error);
    return "Error connecting to AI service.";
  }
};

export const parseSmartEntry = async (text: string): Promise<Partial<Person> | null> => {
  const prompt = `
    Extract genealogy information from the following text into a structured JSON object.
    Text: "${text}"
  `;

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      firstName: { type: Type.STRING },
      lastName: { type: Type.STRING },
      gender: { type: Type.STRING, enum: ['Male', 'Female', 'Other'] },
      birthDate: { type: Type.STRING, description: 'YYYY-MM-DD format if possible, otherwise unstructured string' },
      birthPlace: { type: Type.STRING },
      deathDate: { type: Type.STRING, description: 'YYYY-MM-DD format if possible' },
      deathPlace: { type: Type.STRING },
      bio: { type: Type.STRING, description: 'A summary of the text provided' },
    },
    required: ['firstName', 'lastName', 'gender'],
  };

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    const jsonText = response.text;
    if (!jsonText) return null;
    
    return JSON.parse(jsonText);
  } catch (error) {
    console.error("Gemini Parse Error:", error);
    return null;
  }
};

const formatPersonLine = (p: Person): string => {
  const parts = [`${p.firstName} ${p.lastName} (${p.gender})`];
  if (p.birthDate || p.birthPlace) {
    parts.push(`born ${p.birthDate || '?'}${p.birthPlace ? ` in ${p.birthPlace}` : ''}`);
  }
  if (p.deathDate || p.deathPlace) {
    parts.push(`died ${p.deathDate || '?'}${p.deathPlace ? ` in ${p.deathPlace}` : ''}`);
  }
  if (p.bio) parts.push(`notes: ${p.bio.slice(0, 200)}`);
  return parts.join('; ');
};

const buildTreeContext = (data: TreeData, focusId: string | null, maxPeople = 80): string => {
  const people = Object.values(data.people) as Person[];
  if (people.length === 0) return 'The tree has no people yet.';

  const byId = data.people;
  // Fall back to root/first person if focusId is missing or stale.
  const focusPerson =
    (focusId && byId[focusId]) ||
    byId[data.rootId] ||
    people[0];
  const focusName = focusPerson ? `${focusPerson.firstName} ${focusPerson.lastName}` : 'the family';

  // Pick a focused subset: focus person, ancestors, descendants, spouses, siblings.
  const include = new Set<string>();
  const queue: string[] = [];
  if (focusPerson) {
    include.add(focusPerson.id);
    queue.push(focusPerson.id);
  }
  // Walk down (descendants) and up (ancestors) from the focus.
  while (queue.length && include.size < maxPeople) {
    const id = queue.shift()!;
    const p = byId[id];
    if (!p) continue;
    [p.fatherId, p.motherId].forEach(pid => {
      if (pid && byId[pid] && !include.has(pid)) {
        include.add(pid);
        queue.push(pid);
      }
    });
    (p.childrenIds || []).forEach(cid => {
      if (byId[cid] && !include.has(cid)) {
        include.add(cid);
        queue.push(cid);
      }
    });
    (p.spouseIds || []).forEach(sid => {
      if (byId[sid] && !include.has(sid)) include.add(sid);
    });
  }
  // Top up with anyone else if there's still room.
  for (const p of people) {
    if (include.size >= maxPeople) break;
    include.add(p.id);
  }

  const lines: string[] = [];
  lines.push(`Focus person: ${focusName}.`);
  lines.push(`Total people on record: ${people.length}. People included below: ${include.size}.`);
  lines.push('');
  lines.push('People:');
  Array.from(include).forEach(id => {
    const p = byId[id];
    if (p) lines.push(`- ${formatPersonLine(p)}`);
  });
  lines.push('');
  lines.push('Relationships:');
  Array.from(include).forEach(id => {
    const p = byId[id];
    if (!p) return;
    const name = `${p.firstName} ${p.lastName}`;
    const father = p.fatherId ? byId[p.fatherId] : null;
    const mother = p.motherId ? byId[p.motherId] : null;
    if (father) lines.push(`- ${name} — father: ${father.firstName} ${father.lastName}`);
    if (mother) lines.push(`- ${name} — mother: ${mother.firstName} ${mother.lastName}`);
    (p.spouseIds || []).forEach(sid => {
      const sp = byId[sid];
      if (sp && sid > p.id) lines.push(`- ${name} — spouse: ${sp.firstName} ${sp.lastName}`);
    });
  });
  return lines.join('\n');
};

export const generateFamilyNarrative = async (
  data: TreeData,
  focusPersonId: string | null,
): Promise<string> => {
  const context = buildTreeContext(data, focusPersonId);
  const prompt = `
You are a warm, careful family historian. Using ONLY the records below, write a flowing narrative
history of this family centered on the focus person. Span generations where the records allow.
Group related people into paragraphs (e.g. by generation or branch). Mention dates and places when given.
Do NOT invent specific facts (children, spouses, dates, places, occupations) that are not in the records.
You may add gentle historical context for an era or place if a date is provided.
If information is sparse, say so plainly rather than padding with speculation.
Length: roughly 350–600 words. Use plain prose, no markdown headers, no bullet lists.

Records:
${context}
  `.trim();

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
    });
    return response.text || 'No narrative could be generated.';
  } catch (error) {
    console.error('Gemini Narrative Error:', error);
    throw new Error('Could not reach the AI service. Please try again.');
  }
};