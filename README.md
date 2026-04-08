## FamilyTreeAI

<img width="1408" height="768" alt="image" src="https://github.com/user-attachments/assets/214e3ea5-8511-448e-9ad8-17911b6850b0" />

**Your family history belongs to you, not to a subscription model**. Born out of sheer frustration with the exorbitant fees charged by major genealogy platforms, FamilyTreeAI is a labor of love designed to put your heritage back in your own hands. 

I realized that mapping out where we come from shouldn't cost an arm and a leg, so I built an alternative.

FamilyTreeAI is a completely free, open-source platform that empowers you to capture, preserve, and explore your family tree without the premium price tag.

Because it’s open-source, the power is entirely yours. You can host it yourself, share it privately with your relatives, fork the code to add your own custom features, or contribute back to the community. Stop renting your family history—start owning it.

## Run Locally

**Prerequisites:**  
1. Node.js
2. Firebase if like to host and invite family members (perhaps later I will add other methods)


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. In your Firebase project, create a Firestore database if you have not already
4. In Firebase Console, update your Firestore security rules using [firestore.rules](./firestore.rules) from this repo
5. Update Firebase config file with real values
6. Run the app:
   `npm run dev`
