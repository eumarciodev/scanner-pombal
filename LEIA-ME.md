# Scanner Pombal (React)

Aplicação React responsiva para enquadrar páginas, detectar as bordas, corrigir a perspectiva e limpar o fundo antes de montar um PDF A4 com várias páginas. O processamento usa OpenCV.js carregado sob demanda; se a biblioteca não carregar, o app aplica um tratamento local simplificado e usa o quadro como recorte. Pelo botão de compartilhar, navegadores compatíveis abrem o menu nativo de aplicativos para enviar o próprio PDF; em outros navegadores é oferecido o link público ou o download do arquivo. Sem configurar o Supabase, os PDFs ficam disponíveis no navegador onde foram criados. Com o Supabase configurado, o arquivo e os dados do histórico são enviados para a nuvem.

## Como abrir

Instale uma versão atual do Node.js. Na pasta do projeto, execute `npm install` e depois `npm run dev`; abra no navegador o endereço local informado pelo Vite. Para gerar a versão de publicação, use `npm run build`. Em alguns navegadores, permissões de câmera funcionam melhor quando o site é servido por HTTPS; a opção de escolher fotos também funciona.

## Conectar o Supabase

1. Crie um projeto Supabase.
2. No SQL Editor, execute o conteúdo de `supabase-setup.sql`.
3. No Storage, crie um bucket chamado `scans` e marque-o como público.
4. Abra o arquivo `.env` na raiz do projeto e substitua os valores de `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` pelas credenciais do seu projeto. O Vite precisa ser reiniciado após mudanças no `.env`.

O arquivo `.env.example` mostra o formato esperado. A tela de configuração do site também pode ser usada como alternativa quando não há credenciais no `.env`.

**Atenção:** este primeiro protótipo não tem login. O SQL permite leitura pública dos registros e PDFs para que o histórico e links funcionem sem conta. Use apenas para demonstração; antes de armazenar documentos pessoais ou disponibilizar o site a outras pessoas, implemente autenticação e políticas que restrinjam cada arquivo ao seu dono. A chave pública anon pode ficar no navegador; nunca informe uma chave `service_role`.
