import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Person, Gender } from '../types';

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const modelName = 'gemini-2.5-flash';

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