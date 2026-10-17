// Redimensiona/comprime uma imagem no browser ANTES do upload para o
// Supabase Storage — sem isto, uma foto tirada com um telemóvel atual
// (muitas vezes 8-15MB, 4000x3000px+) era guardada e servida a essa
// resolução total, mesmo quando o site só a mostra em cartões pequenos ou
// médios (avatares de 80px, miniaturas de portfólio de 100px, etc.). Isso
// custa armazenamento a mais no Supabase e torna o carregamento das
// páginas mais lento, sobretudo em dados móveis — exatamente o tipo de
// ligação que a maioria dos clientes/profissionais em Portugal vai usar.
//
// Usa Canvas/createImageBitmap (nativo do browser, sem dependências) para
// reduzir a imagem para no máximo maxWidth x maxHeight, mantendo a
// proporção, e reexporta como JPEG (ou PNG se já era PNG) com qualidade
// reduzida. NUNCA bloqueia o upload por causa disto: qualquer falha aqui
// (formato não suportado pelo browser, ex. HEIC em Chrome/Firefox) cai
// para o ficheiro original sem erro.
const HEAVY_IMAGE_BYTES = 300 * 1024

function temTransparencia(ctx, w, h){
  const d = ctx.getImageData(0, 0, w, h).data
  for(let i = 3; i < d.length; i += 4)if(d[i] < 255)return true
  return false
}

async function resizeImageFile(file, opts){
  opts = opts || {}
  const maxWidth = opts.maxWidth || 1600
  const maxHeight = opts.maxHeight || 1600
  const quality = opts.quality != null ? opts.quality : 0.82

  if(!file || !file.type || !file.type.startsWith('image/'))return file
  // GIFs não são tocados aqui: desenhar um GIF num canvas usa só o
  // primeiro frame, o que apagaria a animação.
  if(file.type === 'image/gif')return file

  try{
    const bitmap = await createImageBitmap(file)
    let { width, height } = bitmap
    const cabe = width <= maxWidth && height <= maxHeight
    // Um ficheiro leve que já cabe fica como está. Um pesado (ex.: PNG de
    // 1 MB com 900px) é recomprimido mesmo sem precisar de encolher.
    if(cabe && file.size <= HEAVY_IMAGE_BYTES){
      if(bitmap.close)bitmap.close()
      return file
    }
    const scale = cabe ? 1 : Math.min(maxWidth / width, maxHeight / height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, width, height)
    if(bitmap.close)bitmap.close()

    // PNG só se precisar de transparência (logótipos); uma foto em PNG passa
    // a JPEG, que fica várias vezes mais leve. O fundo branco por baixo evita
    // que pixels semitransparentes fiquem pretos no JPEG.
    const manterPng = file.type === 'image/png' && temTransparencia(ctx, width, height)
    if(!manterPng && file.type === 'image/png'){
      ctx.globalCompositeOperation = 'destination-over'
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, width, height)
    }
    const outType = manterPng ? 'image/png' : 'image/jpeg'
    const blob = await new Promise(resolve => canvas.toBlob(resolve, outType, quality))
    if(!blob || blob.size >= file.size)return file // não ajudou (ou falhou) — usa o original

    const newExt = outType === 'image/png' ? 'png' : 'jpg'
    const newName = file.name.replace(/\.\w+$/, '') + '.' + newExt
    return new File([blob], newName, { type: outType, lastModified: Date.now() })
  }catch(e){
    console.error('resizeImageFile error:', e)
    return file // nunca bloqueia o upload por causa de uma falha aqui
  }
}
