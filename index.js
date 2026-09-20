<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Conferência de Controlados</title>
    <!-- Estilos embutidos diretamente para garantir que o fundo escuro nunca fique branco no celular -->
    <style>
        body { background-color: #0f141c; color: #f1f5f9; font-family: sans-serif; min-height: 100vh; margin: 0; padding: 16px; display: flex; flex-direction: column; items-center: center; justify-content: center; }
        main { w-width: 100%; max-width: 400px; background-color: #161f2c; border: 1px solid #334155; border-radius: 16px; padding: 20px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); box-sizing: border-box; }
        h1 { font-size: 20px; font-weight: 800; color: #ffffff; margin: 0 0 4px 0; }
        p { font-size: 12px; color: #94a3b8; margin: 0 0 16px 0; }
        .upload-area { width: 100%; height: 200px; background-color: #0f141c; border: 2px dashed #475569; border-radius: 12px; display: flex; flex-direction: column; items-center: center; justify-content: center; text-align: center; cursor: pointer; margin-bottom: 16px; overflow: hidden; }
        /* TRAVA DE SEGURANÇA DA IMAGEM: Garante que a foto NUNCA passe de 180px e empurre o botão */
        #image-preview { width: 100%; height: 100%; max-height: 180px; object-fit: contain; border-radius: 8px; }
        .input-group { margin-bottom: 12px; }
        .input-group label { display: block; font-size: 11px; font-weight: bold; color: #94a3b8; uppercase: true; margin-bottom: 4px; }
        .input-group input { width: 100%; background-color: #1e293b; border: 1px solid #475569; border-radius: 8px; padding: 10px; color: #ffffff; font-size: 13px; box-sizing: border-box; }
        .btn-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 12px; margin-top: 16px; }
        button { font-weight: 700; padding: 14px; border-radius: 12px; border: none; cursor: pointer; text-transform: uppercase; font-size: 11px; tracking-wider: true; transition: 0.2s; }
        .btn-secondary { background-color: #1f2b3e; color: #cbd5e1; }
        .btn-primary { background-color: #10b981; color: #0f172a; font-weight: 900; }
        .hidden { display: none !important; }
        #result-panel { margin-top: 16px; padding: 12px; border-radius: 8px; font-size: 12px; line-height: 1.5; font-weight: 600; display: none; }
    </style>
</head>
<body>

    <main>
        <h1>⚡ FARMA-CHECK</h1>
        <p>Tire a foto da receita para conferência regulatória automática.</p>

        <!-- Campo para colar a URL do Render -->
        <div class="input-group">
            <label>Endereço do Servidor Ativo (Render)</label>
            <input type="text" id="server-url" value="https://onrender.com">
        </div>

        <!-- Área de Upload que abre a câmera -->
        <div class="upload-area" onclick="document.getElementById('file-input').click()">
            <input type="file" id="file-input" accept="image/*" capture="environment" class="hidden" onchange="previewImage(event)">
            <div id="upload-placeholder" style="color: #64748b;">
                <div style="font-size: 24px; margin-bottom: 4px;">📷</div>
                <div style="font-size: 12px; font-weight: bold;">Toque para Fotografar a Receita</div>
            </div>
            <img id="image-preview" class="hidden">
        </div>

        <!-- Botões operacionais -->
        <div class="btn-grid">
            <button class="btn-secondary" onclick="document.getElementById('file-input').click()">Trocar foto</button>
            <button class="btn-primary" onclick="analyzeRecipe()" id="btn-analyze">Analisar</button>
        </div>

        <!-- Painel de Resultados -->
        <div id="result-panel"></div>
    </main>

    <script>
        let base64Image = "";

        function previewImage(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                document.getElementById('image-preview').src = e.target.result;
                document.getElementById('image-preview').classList.remove('hidden');
                document.getElementById('upload-placeholder').classList.add('hidden');

                const img = new Image();
                img.src = e.target.result;
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1000; 
                    let width = img.width;
                    let height = img.height;

                    if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    base64Image = canvas.toDataURL('image/jpeg', 0.6);
                }
            }
            reader.readAsDataURL(file);
        }

        async function analyzeRecipe() {
            if (!base64Image) { alert("Por favor, tire a foto da receita primeiro."); return; }
            const btn = document.getElementById('btn-analyze');
            const panel = document.getElementById('result-panel');
            const url = document.getElementById('server-url').value.trim();

            btn.disabled = true;
            btn.innerText = `Lendo Papel...`;
            panel.style.display = "none";

            try {
                const res = await fetch(`${url}/api/analyze`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: base64Image })
                });
                const data = await res.json();
                panel.style.display = "block";

                if (data.success) {
                    if (data.hasAlert) {
                        panel.style.backgroundColor = "#451a03";
                        panel.style.border = "1px solid #9a3412";
                        panel.style.color = "#fde047";
                        panel.innerText = "🔴 CONFERÊNCIA OBRIGATÓRIA:\n\n" + data.message;
                    } else {
                        panel.style.backgroundColor = "#064e3b";
                        panel.style.border = "1px solid #065f46";
                        panel.style.color = "#6ee7b7";
                        panel.innerText = "✓ TRIAGEM CONCLUÍDA:\n\n" + data.message;
                    }
                } else { throw new Error(data.error || "Erro no processamento."); }
            } catch (err) {
                panel.style.display = "block";
                panel.style.backgroundColor = "#4c0519";
                panel.style.border = "1px solid #9f1239";
                panel.style.color = "#fda4af";
                panel.innerText = "⚠️ FALHA NO SERVIDOR:\nO Render pode estar iniciando ou processando o OCR. Verifique a receita manualmente.";
            } finally {
                btn.disabled = false;
                btn.innerText = "Analisar";
            }
        }
    </script>
</body>
</html>
