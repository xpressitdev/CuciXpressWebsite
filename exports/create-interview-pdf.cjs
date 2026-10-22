const { jsPDF } = require('jspdf');
const fs = require('fs');
const doc = new jsPDF({ unit: 'mm', format: 'a4' });
const output = 'exports/Cuci_Xpress_UTB_Interview_Responses.pdf';
let y = 0;
function page(section) {
  if (y) doc.addPage();
  doc.setFillColor(20, 55, 63); doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text('CUCI XPRESS', 18, 13);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text('UTB School of Business | Interview responses', 18, 21);
  doc.setTextColor(35); doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text(section, 18, 40); y = 49;
}
function text(s, {bold=false, size=10.5, color=[40,48,52]}={}) {
  doc.setFont('helvetica', bold?'bold':'normal'); doc.setFontSize(size); doc.setTextColor(...color);
  const lines=doc.splitTextToSize(s,174);
  doc.text(lines,18,y); y+=lines.length*5+3;
}
function q(n, title, paragraphs, note) {
  text(`${n}. ${title}`,{bold:true,size:11});
  paragraphs.forEach(p=>text(p));
  if(note) text(`CONFIRM BEFORE SENDING: ${note}`,{size:9.5,color:[140,85,15]});
  y+=4;
}
page('Draft for owner review');
text('Academic interview | Universiti Teknologi Brunei',{bold:true,size:12});
text('Thank you for considering Cuci Xpress for your assignment. We are happy to share an overview of our operations and approach to customer relationship management.');
text('These responses are provided for your academic assignment. We have kept commercially sensitive information and personal data confidential. Please obtain our permission before publishing the responses outside the assignment or requesting access to internal records.');
text('Review before sharing',{bold:true,size:12});
text('This is a draft in Cuci Xpress\'s voice, not a final approved statement. Confirmation notes are retained so that unverified details are not presented as established facts.');
text('Before sending:\n- Question 1: confirm the outlet, opening date, and staffing disclosure.\n- Question 2: attach the current approved public price list and confirm which membership plans are available.\n- Question 6: confirm the advertising channels currently used.\n- Question 12: confirm that the proposed complaint-handling wording matches current practice.');
text('Confidentiality approach',{bold:true,size:12});
text('The responses exclude actual financial results, setup investment, daily vehicle counts, customer records, supplier quotations, account credentials, and internal system access. Demonstrations for students should use fictional or appropriately anonymised data.');
page('Business background | Questions 1-3');
q(1,'How long has the outlet operated, and how many staff work here by role?',[
'The outlet has operated since [insert opening month and year].',
'Our operations involve customer service and payment handling, preparing vehicles for washing, guiding vehicles through the wash process, and supervising service quality and daily operations. Some responsibilities may overlap depending on the shift.'
],'Confirm the outlet and opening date. If comfortable disclosing staffing, insert an approximate total and role breakdown; otherwise retain the general description above.');
q(2,'What services and packages do you offer, and what are the prices?',[
'Cuci Xpress offers drive-thru car-wash services, with wash packages and optional add-ons to suit different customer needs. We also have loyalty benefits and membership options for regular customers.',
'For your assignment, please refer to our current public service menu for the exact package names, inclusions, and prices, as these may change with promotions or service updates.'
],'Attach the current approved price list. Only include membership plans currently available to customers.');
q(3,'Who are your main competitors, and how do you decide your prices compared with theirs?',[
'Our competitive market includes other automated car washes, traditional manual car washes, and washing services located at petrol stations or similar locations.',
'We consider market prices, but our pricing is not based solely on being cheaper than competitors. We also consider service quality, convenience, operating costs, equipment upkeep, and the value customers receive.',
'We prefer to discuss competitor categories rather than comment on individual businesses or their performance.'
]);
page('Business background | Questions 4-6');
q(4,'What makes you different from them?',[
'Our main points of differentiation are the drive-thru format, the use of automation, and the convenience of a structured wash process.',
'Digital customer services, loyalty benefits, and membership options also support repeat visits. Our aim is to make routine car washing straightforward and consistent. Actual waiting and service times depend on the selected service and how busy the outlet is.'
]);
q(5,'What does it cost to set up a drive-thru car wash, and could a new competitor enter easily?',[
'We do not disclose our actual setup investment or individual supplier quotations.',
'In general, establishing a drive-thru car wash requires investment in suitable premises, washing equipment, site preparation, drainage, water and electrical infrastructure, relevant approvals, staff training, and working capital.',
'Entry is possible, but purchasing equipment alone is not enough. A new operator also needs a suitable location, reliable maintenance support, trained staff, and sufficient customer demand. These create practical and financial barriers to entry.'
]);
q(6,'Do you advertise, and which channel works best?',[
'Different channels serve different purposes. Social media can help people discover the business and understand an offer, while outlet signage can attract passing motorists. Recommendations from satisfied customers can also support awareness.',
'We would not identify one channel as the most effective without reliable evidence connecting it to customer visits. Advertising budgets and detailed campaign results are kept internal.'
],'Confirm the channels currently used, for example social media, promotions, and outlet signage.');
page('Business background and CRM | Questions 7-9');
q(7,'Roughly how many cars do you wash on a weekday versus a weekend, and what are your peak and quiet times?',[
'We keep detailed vehicle volumes and outlet-level demand patterns confidential.',
'At a general level, demand can vary with the day of the week, weather, public holidays, and promotions. We use visit patterns to help plan staffing and manage queues.',
'For the assignment, we can discuss how demand affects operations without providing daily counts or detailed operating statistics.'
]);
q(8,'What are your main costs, and is the business profitable, break-even, or loss-making?',[
'The main cost categories for this type of business include labour, premises, water, electricity, cleaning products, equipment maintenance, payment processing, and administration. Equipment replacement and unexpected repairs also need to be considered.',
'We do not disclose whether individual outlets are profitable, breaking even, or loss-making, or provide profit-margin percentages.',
'From a business-management perspective, sustainable performance depends on balancing customer demand, pricing, service quality, equipment reliability, and operating costs.'
]);
q(9,'What happens from arrival to departure, including payment? What is recorded, and where?',[
'A typical visit involves the following steps:\n1. The customer selects a wash package or presents an eligible prepaid wash or membership.\n2. Staff identify the vehicle and confirm the service.\n3. Payment is collected, or the prepaid entitlement or membership is verified.\n4. The vehicle joins the wash queue and is guided through the service.\n5. The service is completed, and a receipt is available.',
'Our digital point-of-sale and customer-management system records information needed to manage the transaction and service, such as the selected package, vehicle reference, payment method, and visit status.',
'We can explain the overall process, but we would not share actual customer transactions or internal system access for the assignment.'
]);
page('Customers and CRM | Questions 10-12');
q(10,'How does the monthly membership work?',[
'Membership allows an enrolled vehicle to receive eligible wash services during its validity period, subject to the plan\'s terms.',
'Registration involves the customer and vehicle details needed to establish the membership. Our system tracks its validity and associated visits. At arrival, staff verify the membership through the system, including the relevant QR-based process, rather than relying only on a customer\'s statement or screenshot.',
'The exact validity period, usage conditions, and renewal arrangements should be taken from the current published plan terms.'
]);
q(11,'What customer information do you keep, how is it stored, and who can access it?',[
'Depending on the service and whether the customer registers an account, records may include their name, contact details, vehicle registration number, vehicle details, membership information, and transaction or visit history.',
'These records are maintained in our digital systems. Staff access is controlled according to their roles and responsibilities.',
'For this academic exercise, we would not provide identifiable customer records, contact lists, vehicle-registration lists, account credentials, or payment information. Any demonstration should use fictional or appropriately anonymised examples.'
]);
q(12,'How do you handle enquiries, complaints, or feedback? Do you follow up with customers?',[
'Customers can raise enquiries or concerns with outlet staff or through our official contact channels. We clarify the issue, check relevant service information where necessary, and refer matters requiring further action to the appropriate person.',
'Follow-up should focus on resolving the concern and communicating the outcome. Service-related messages, such as membership information, should be distinguished from promotional communications, with customer privacy and communication preferences respected.'
],'Suggested wording only: confirm that it matches your current process.');
page('Customers and CRM | Questions 13-14');
q(13,'What is the biggest problem with managing customer and membership records now?',[
'A key ongoing priority is maintaining consistent and accurate records across counter transactions and online customer activity.',
'For example, vehicle details may be entered in different formats. Records must be checked carefully so that visits and membership benefits remain associated with the correct vehicle and customer.',
'We treat this as an ongoing data-quality responsibility rather than assuming that similar-looking records should automatically be combined. We would not disclose individual cases or internal incident details.'
]);
q(14,'Would you want a simple system to record customers, memberships, visits, and complaints? What would it need to do?',[
'We already use digital systems for customer records, memberships, and visits, so the priority would be improving existing capabilities rather than introducing a separate system that duplicates records.',
'A useful solution or enhancement would need to:\n- Keep customer and vehicle records accurate.\n- Track membership validity, visits, and renewals.\n- Help staff identify possible duplicate records for review.\n- Support complaint tracking and follow-up.\n- Restrict access according to staff responsibilities.\n- Maintain a history of important record changes.\n- Provide useful reports without unnecessarily exposing personal data.\n- Be simple for staff to use during busy periods.',
'For a student prototype, we would recommend using fictional data and demonstrating the workflow without connecting to our live systems.'
]);
for(let i=1;i<=doc.getNumberOfPages();i++){
  doc.setPage(i); doc.setDrawColor(210); doc.line(18,280,192,280);
  doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(100);
  doc.text('DRAFT - Owner review required | Academic use',18,286);
  doc.text(`${i} / ${doc.getNumberOfPages()}`,192,286,{align:'right'});
}
doc.setProperties({title:'Cuci Xpress - UTB Interview Responses',subject:'Confidentiality-conscious draft for owner review',author:'Cuci Xpress'});
fs.writeFileSync(output,Buffer.from(doc.output('arraybuffer')));
console.log(output);
