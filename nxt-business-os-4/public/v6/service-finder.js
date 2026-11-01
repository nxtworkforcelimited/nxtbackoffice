(() => {
  const goals = [
    { label: "Reach more customers", question: "How would you like customers to find you?", choices: [
      { label: "Find us in search results", service: "SEO", path: "/services/digital/seo", reason: "Help customers find the right page through search. We review technical issues, search intent and page content, then prioritise improvements you can measure." },
      { label: "Find us nearby on Google Maps", service: "Google Business Profile management", path: "/services/digital/google-business-profile", reason: "Make it easier for nearby customers to call, visit or ask for directions. We review your listing, opening hours, photos and services, and help you manage reviews." },
      { label: "Discover us on social media", service: "Social media management", path: "/services/digital/social-media-management", reason: "Give your audience a reason to come back. We plan a content calendar, create posts, manage replies and report on the conversations and enquiries your channels generate." },
      { label: "See our paid adverts", service: "Paid advertising", path: "/services/digital/paid-advertising", reason: "Reach people who are likely to buy. We agree a campaign objective and budget, build the ads and track which enquiries turn into sales conversations." },
      { label: "Launch a small business online", service: "SME digital packages", path: "/services/sme-digital-packages", reason: "Bring the essentials together in an affordable scope agreed up front. Choose a starting mix of website, local search, social content and lead follow-up, then add support as you grow." },
    ] },
    { label: "Build my brand", question: "What does your brand need?", choices: [
      { label: "An identity, packaging or design", service: "Branding and graphic design", path: "/services/digital/graphic-design", reason: "Give your business a consistent identity across packaging, print and digital channels. Get artwork your team can use with printers, sales staff and marketing partners." },
      { label: "Copy for our website or articles", service: "Content writing", path: "/services/digital/content-writing", reason: "Explain what you sell in words your customers use. We write website copy, articles and sales materials around the questions people ask before they buy." },
      { label: "A clearer picture of our market", service: "Market research", path: "/services/sales/market-research", reason: "Make a business decision with a clearer view of your market. We agree the question, gather evidence on buyers and competitors, and report what it means for your next move." },
    ] },
    { label: "Grow sales", question: "Where does your sales team need help?", choices: [
      { label: "Find the right prospects", service: "Lead generation and lead-list sourcing", path: "/services/sales/lead-generation", reason: "Build a prospect list around your target industries, locations and buyer roles. We research and qualify business contacts, record sources and agree how leads will be handed over." },
      { label: "Call prospects and book meetings", service: "Cold calling and outbound sales", path: "/services/sales/outbound-calling", reason: "Start conversations with a defined audience. We prepare the calling brief, record outcomes and hand qualified opportunities to your sales team with clear next steps." },
      { label: "Track leads and follow-ups", service: "CRM setup and business systems", path: "/services/technology/crm-setup", reason: "Help your team see who owns each lead, what happened last and what to do next. We configure pipelines, follow-up tasks and reports around your sales process." },
      { label: "Email prospects and customers", service: "Email marketing", path: "/services/digital/email-marketing", reason: "Stay in touch with prospects and existing customers. We segment your list, write campaigns and track the clicks, replies and follow-ups that matter to your team." },
    ] },
    { label: "Support customers", question: "How do you want to reach or help customers?", choices: [
      { label: "Use a WhatsApp bot", service: "WhatsApp Business messaging and bots", path: "/services/whatsapp-business", reason: "Respond to common questions, send agreed booking updates and hand conversations to your staff. We connect WhatsApp to the systems your team already uses." },
      { label: "Send SMS reminders and updates", service: "Business SMS messaging", path: "/services/business-sms", reason: "Send appointment reminders, invoice notices and payment acknowledgements from the systems that trigger them. Give staff a record of what was sent and which messages need follow-up." },
      { label: "Manage inbound calls", service: "Managed contact centre services", path: "/services/outsourcing/contact-centre", reason: "Give customers a consistent point of contact. We agree coverage, scripts, escalation routes and reporting so your team can see what callers need and what was resolved." },
      { label: "Resolve customer support requests", service: "Customer support", path: "/services/outsourcing/customer-support", reason: "Keep customer questions moving toward a resolution. We manage agreed channels, record issues, follow up with customers and escalate cases that need your team." },
    ] },
    { label: "Build a website or system", question: "What would you like to build?", choices: [
      { label: "Register a domain name", service: "Domain registration", path: "/domains", reason: "Give your business a web address it owns. We check your preferred name, confirm registration and renewal fees, and guide you through setup once you approve." },
      { label: "Create or improve our website", service: "Website design and development", path: "/services/technology/website-design", reason: "Turn visits into useful action. We plan the pages, write clear enquiry routes and build a mobile-friendly website around what customers need to do." },
      { label: "Build an app or customer portal", service: "Web applications and portals", path: "/services/technology/portals-and-apps", reason: "Give customers or staff one place to book, submit information or check progress. We map the workflow, define permissions and build around the people using it." },
      { label: "Build a staff back office", service: "Custom back-office development", path: "/services/back-office-systems", reason: "Give staff a shared workspace for bookings, quotes, invoices, shifts and support. We build around your approval steps, permissions and reporting needs." },
      { label: "Connect AI to our systems", service: "AI integration and automation", path: "/services/ai-integration", reason: "Connect WhatsApp, your CRM and routine tasks. We map what AI can handle, where a person should take over and how your team will check the results." },
    ] },
    { label: "Get operational support", question: "What should your team spend less time on?", choices: [
      { label: "Daily admin and scheduling", service: "Virtual assistants", path: "/services/virtual-assistants", reason: "Free up time for work that needs your attention. A virtual assistant handles agreed recurring tasks such as diary coordination, inbox follow-up, research and reporting." },
      { label: "Capturing and checking data", service: "Data capturing and data processing", path: "/services/outsourcing/data-capture", reason: "Turn forms, spreadsheets and other agreed sources into usable records. We capture and validate fields, flag duplicates and exceptions, and return the results in your agreed format." },
      { label: "Storing and protecting records", service: "Managed Data Storage & Protection", path: "/services/data-protection", reason: "Get ongoing help holding and looking after business records. We agree where records will be held, who can use them, how long to keep them and what to review with you each month." },
      { label: "Repetitive tasks AI could handle", service: "AI integration and automation", path: "/services/ai-integration", reason: "Connect WhatsApp, your CRM and routine tasks. We map what AI can handle, where a person should take over and how your team will check the results." },
    ] },
  ];

  const card = document.querySelector('[data-service-finder]');
  if (!card) return;
  const form = card.querySelector('form');
  const progress = card.querySelector('[data-progress]');
  const question = card.querySelector('[data-question]');
  const choices = card.querySelector('[data-choices]');
  const result = card.querySelector('[data-result]');
  const next = card.querySelector('[data-next]');
  const back = card.querySelector('[data-back]');
  const reset = card.querySelector('[data-reset]');
  const answers = [null, null];
  let step = 0;

  function render(moveFocus) {
    const showResult = step === 2;
    const goal = goals[answers[0]];
    choices.replaceChildren();
    choices.hidden = showResult;
    result.hidden = !showResult;
    next.hidden = showResult;
    back.hidden = step === 0;
    reset.hidden = !showResult;
    if (showResult) {
      const match = goal.choices[answers[1]];
      progress.textContent = 'Your service match';
      question.textContent = match.service;
      result.querySelector('[data-reason]').textContent = match.reason;
      result.querySelector('[data-details]').href = match.path;
      result.querySelector('[data-enquiry]').href =
        '/contact?service=' + encodeURIComponent(match.service) + '#nxtLeadForm';
    } else {
      progress.textContent = 'Question ' + (step + 1) + ' of 2';
      question.textContent = step === 0 ? 'What would you like to do?' : goal.question;
      const options = step === 0 ? goals : goal.choices;
      options.forEach((option, index) => {
        const label = document.createElement('label');
        label.className = 'finder-option';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'finder-choice';
        radio.value = String(index);
        radio.checked = answers[step] === index;
        label.append(radio, document.createTextNode(option.label));
        choices.append(label);
      });
      next.textContent = step === 0 ? 'Next' : 'Show my service';
      next.disabled = answers[step] === null;
    }
    if (moveFocus) question.focus();
  }

  choices.addEventListener('change', event => {
    const answer = Number(event.target.value);
    if (step === 0 && answers[0] !== answer) answers[1] = null;
    answers[step] = answer;
    next.disabled = false;
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (step === 2 || answers[step] === null) return;
    step += 1;
    render(true);
  });
  back.addEventListener('click', () => {
    step -= 1;
    render(true);
  });
  reset.addEventListener('click', () => {
    step = 0;
    answers.fill(null);
    render(true);
  });
  render(false);
  card.hidden = false;
})();
