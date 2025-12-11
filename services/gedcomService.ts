import { TreeData, Person, Gender } from '../types';

/**
 * Helper to format date for GEDCOM (YYYY-MM-DD -> DD MMM YYYY)
 * Simple implementation: returns unmodified or basic format
 */
const formatGedcomDate = (dateStr?: string): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  
  const day = date.getDate();
  const month = date.toLocaleString('default', { month: 'short' }).toUpperCase();
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
};

/**
 * Generates a GEDCOM 5.5.1 compatible string from TreeData
 */
export const generateGedcom = (data: TreeData): string => {
  const { people } = data;
  const lines: string[] = [];
  const peopleList = Object.values(people);

  // 1. HEAD
  lines.push('0 HEAD');
  lines.push('1 SOUR FamilyTreeAI');
  lines.push('1 GEDC');
  lines.push('2 VERS 5.5.1');
  lines.push('2 FORM LINEAGE-LINKED');
  lines.push('1 CHAR UTF-8');

  // 2. INDIVIDUALS (INDI)
  peopleList.forEach(person => {
    lines.push(`0 @I${person.id}@ INDI`);
    lines.push(`1 NAME ${person.firstName} /${person.lastName}/`);
    lines.push(`2 GIVN ${person.firstName}`);
    lines.push(`2 SURN ${person.lastName}`);
    lines.push(`1 SEX ${person.gender === Gender.Male ? 'M' : person.gender === Gender.Female ? 'F' : 'U'}`);
    
    if (person.birthDate || person.birthPlace) {
      lines.push('1 BIRT');
      if (person.birthDate) lines.push(`2 DATE ${formatGedcomDate(person.birthDate)}`);
      if (person.birthPlace) lines.push(`2 PLAC ${person.birthPlace}`);
    }

    if (person.deathDate || person.deathPlace) {
      lines.push('1 DEAT');
      if (person.deathDate) lines.push(`2 DATE ${formatGedcomDate(person.deathDate)}`);
      if (person.deathPlace) lines.push(`2 PLAC ${person.deathPlace}`);
    }

    if (person.bio) {
      lines.push('1 NOTE ' + person.bio.replace(/\n/g, ' '));
    }

    // Link to families where this person is a child
    if (person.fatherId || person.motherId) {
       // We construct a family ID based on parents. 
       // Logic: Family ID is F_{FatherID}_{MotherID}
       // If one is missing, we use 'U' (Unknown)
       const fid = `F_${person.fatherId || 'U'}_${person.motherId || 'U'}`;
       lines.push(`1 FAMC @${fid}@`);
    }

    // Link to families where this person is a spouse
    // We will handle FAMS lines by iterating known spouses
    person.spouseIds.forEach(spouseId => {
        // To avoid duplicate family records, we sort IDs to make a unique key
        const ids = [person.id, spouseId].sort();
        const fid = `F_${ids[0]}_${ids[1]}`;
        lines.push(`1 FAMS @${fid}@`);
    });
  });

  // 3. FAMILIES (FAM)
  // We need to deduce families. A family exists if:
  // a) A child has parents
  // b) Two people are spouses
  
  const families = new Map<string, { husb?: string, wife?: string, children: string[] }>();

  // Helper to get/create family
  const getFamily = (key: string) => {
      if (!families.has(key)) {
          families.set(key, { children: [] });
      }
      return families.get(key)!;
  };

  peopleList.forEach(person => {
      // Case A: Child relationship
      if (person.fatherId || person.motherId) {
          const fKey = `F_${person.fatherId || 'U'}_${person.motherId || 'U'}`;
          const fam = getFamily(fKey);
          fam.children.push(person.id);
          if (person.fatherId) fam.husb = person.fatherId;
          if (person.motherId) fam.wife = person.motherId;
      }

      // Case B: Spouse relationship
      // Note: This might overlap with Case A if they have children, 
      // but if they have NO children, we still need a family record.
      person.spouseIds.forEach(spouseId => {
           const ids = [person.id, spouseId].sort();
           const fKey = `F_${ids[0]}_${ids[1]}`;
           const fam = getFamily(fKey);
           
           // Assign Husband/Wife based on gender if possible, otherwise by sort order
           // This is a simplification; robust logic checks gender of both
           if (person.gender === Gender.Male) fam.husb = person.id;
           else if (person.gender === Gender.Female) fam.wife = person.id;
           
           const spouse = people[spouseId];
           if (spouse) {
               if (spouse.gender === Gender.Male) fam.husb = spouseId;
               else if (spouse.gender === Gender.Female) fam.wife = spouseId;
           }

           // Fallback if genders are same or unknown
           if (!fam.husb && !fam.wife) {
               fam.husb = ids[0];
               fam.wife = ids[1];
           }
      });
  });

  // Output FAM records
  families.forEach((fam, key) => {
      lines.push(`0 @${key}@ FAM`);
      if (fam.husb) lines.push(`1 HUSB @I${fam.husb}@`);
      if (fam.wife) lines.push(`1 WIFE @I${fam.wife}@`);
      fam.children.forEach(childId => {
          lines.push(`1 CHIL @I${childId}@`);
      });
  });

  // 4. TRAILER
  lines.push('0 TRLR');

  return lines.join('\n');
};