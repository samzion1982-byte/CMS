/* Map Event Recorder DB rows → form shapes used by extract/register sheets */

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function safeFilePart(s) {
  return String(s || 'record')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 50)
}

export function recordSlNo(record) {
  return `${String(record.seq_num ?? '').padStart(4, '0')}/${record.year ?? ''}`
}

export function recordFolderName(kind, record) {
  const sn = `${String(record.seq_num ?? '').padStart(4, '0')}-${record.year ?? ''}`
  if (kind === 'wedding') {
    const who = [record.name_groom, record.name_bride].filter(Boolean).join('_and_')
    return `${sn}_${safeFilePart(who || 'wedding')}`
  }
  return `${sn}_${safeFilePart(record.name)}`
}

export function baptismToForm(r) {
  return {
    seqNum: String(r.seq_num ?? ''),
    year: r.year ?? '',
    dateOfBaptism: r.date_of_baptism ?? '',
    baptismType: r.baptism_type ?? '',
    dateOfBirth: r.date_of_birth ?? '',
    name: r.name ?? '',
    gender: r.gender ?? '',
    fatherName: r.father_name ?? '',
    motherName: r.mother_name ?? '',
    professionOfParents: r.profession_of_parents ?? '',
    address: r.address ?? '',
    placeOfBaptism: r.place_of_baptism ?? '',
    baptizedBy: r.baptized_by ?? '',
    godParents: r.god_parents ?? '',
    remarks: r.remarks ?? '',
  }
}

export function confirmationToForm(r) {
  return {
    seqNum: String(r.seq_num ?? ''),
    year: r.year ?? '',
    dateOfConfirmation: r.date_of_confirmation ?? '',
    dateOfBirth: r.date_of_birth ?? '',
    name: r.name ?? '',
    gender: r.gender ?? '',
    fatherName: r.father_name ?? '',
    motherName: r.mother_name ?? '',
    address: r.address ?? '',
    dateOfBaptism: r.date_of_baptism ?? '',
    placeOfBaptism: r.place_of_baptism ?? '',
    baptizedBy: r.baptized_by ?? '',
    baptismRegNo: r.baptism_reg_no ?? '',
    placeOfConfirmation: r.place_of_confirmation ?? '',
    confirmedBy: r.confirmed_by ?? '',
    remarks: r.remarks ?? '',
  }
}

export function burialToForm(r) {
  return {
    seqNum: String(r.seq_num ?? ''),
    year: r.year ?? '',
    whenDied: r.when_died ?? '',
    whenBuried: r.when_buried ?? '',
    name: r.name ?? '',
    gender: r.gender ?? '',
    age: r.age ?? '',
    profession: r.profession ?? '',
    causeOfDeath: r.cause_of_death ?? '',
    parentsName: r.parents_name ?? '',
    spouseName: r.spouse_name ?? '',
    whereBuried: r.where_buried ?? '',
    buriedBy: r.buried_by ?? '',
    applicantName: r.applicant_name ?? '',
    applicantContact: r.applicant_contact ?? '',
    applicantAddress: r.applicant_address ?? '',
    remarks: r.remarks ?? '',
  }
}

export function weddingToForm(r) {
  return {
    seqNum: String(r.seq_num ?? ''),
    year: r.year ?? '',
    month: r.month ? String(r.month) : '',
    day: r.day ? String(r.day) : '',
    nameGroom: r.name_groom ?? '',
    surnameGroom: r.surname_groom ?? '',
    ageGroom: r.age_groom ?? '',
    dobGroom: r.dob_groom ?? '',
    conditionGroom: r.condition_groom ?? '',
    professionGroom: r.profession_groom ?? '',
    fatherNameGroom: r.father_name_groom ?? '',
    addressGroom: r.address_groom ?? '',
    w1NameGroom: r.w1_name_groom ?? '',
    w1AddrGroom: r.w1_addr_groom ?? '',
    w2NameGroom: r.w2_name_groom ?? '',
    w2AddrGroom: r.w2_addr_groom ?? '',
    nameBride: r.name_bride ?? '',
    surnameBride: r.surname_bride ?? '',
    ageBride: r.age_bride ?? '',
    dobBride: r.dob_bride ?? '',
    conditionBride: r.condition_bride ?? '',
    professionBride: r.profession_bride ?? '',
    fatherNameBride: r.father_name_bride ?? '',
    addressBride: r.address_bride ?? '',
    w1NameBride: r.w1_name_bride ?? '',
    w1AddrBride: r.w1_addr_bride ?? '',
    w2NameBride: r.w2_name_bride ?? '',
    w2AddrBride: r.w2_addr_bride ?? '',
    bann: r.bann ?? '',
    placeOfMarriage: r.place_of_marriage ?? '',
    solemnizedBy: r.solemnized_by ?? '',
    remarks: r.remarks ?? '',
  }
}
