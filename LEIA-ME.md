# Scanner Pombal

Scanner de documentos em React. O site enquadra as folhas, corrige a perspectiva, cria PDFs A4 com várias páginas e permite revisar a ordem, remover páginas, ajustar os cantos e restaurar a detecção automática. Há três tratamentos de imagem (documento nítido, escala de cinza e colorido), prévia do PDF, OCR em português com texto copiável e pesquisável, nome e categoria editáveis e compartilhamento do PDF completo ou de páginas selecionadas.

## Como abrir

Instale uma versão atual do Node.js. Na pasta do projeto, execute `npm install` e depois `npm run dev`; abra no navegador o endereço local informado pelo Vite. Para gerar a versão de publicação, use `npm run build`. O navegador precisa de HTTPS (ou localhost) para liberar a câmera.

## Supabase com histórico privado

1. Crie um projeto Supabase.
2. No SQL Editor, execute `supabase-setup.sql`. O script cria/atualiza a tabela e configura um bucket privado com políticas que limitam arquivos e registros à conta autenticada.
3. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no `.env` e reinicie o Vite. Use somente a chave pública anon/publishable; nunca coloque uma chave `service_role` no navegador.
4. Em Supabase → Authentication → URL Configuration, adicione a origem do site (por exemplo `http://localhost:5173` durante o desenvolvimento e o domínio publicado) à lista de redirect URLs.
5. Crie uma conta por e-mail e entre antes de salvar documentos no Supabase. Se a confirmação de e-mail estiver ativa, confirme o endereço antes de entrar.

Documentos anteriores à ativação das políticas que não tenham `user_id` continuam sem acesso por segurança; associe manualmente os registros à conta correta antes de usá-los. Sem Supabase, os PDFs ficam apenas no armazenamento local do navegador. O OCR carrega Tesseract.js e o idioma português sob demanda; a primeira utilização requer internet. O compartilhamento direto depende do suporte do navegador e do dispositivo.
