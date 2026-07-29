const fs = require('fs');

let code = fs.readFileSync('src/components/generation/GenerationScreenV2.tsx', 'utf8');
// Change default templateId to "" so nothing is selected by default
code = code.replace(/useState<import\("@\/lib\/templates"\)\.TemplateId>\("auto"\)/g, 
  'useState<import("@/lib/templates").TemplateId | "">("")');
code = code.replace(/style\.templateId = templateId;/g, 
  'style.templateId = templateId || "auto";');
fs.writeFileSync('src/components/generation/GenerationScreenV2.tsx', code);

let promptForm = fs.readFileSync('src/components/generation/PromptForm.tsx', 'utf8');
promptForm = promptForm.replace(/templateId: TemplateId;/g, 'templateId: TemplateId | "";');
fs.writeFileSync('src/components/generation/PromptForm.tsx', promptForm);
