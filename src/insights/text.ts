// A chapter's plain text from its (X)HTML, the way the insights see it: markup out, common entities in.
export function plainText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|dt|dd|figcaption|caption|title)>|<br\b[^>]*>/gi, '\n') // a block ends a line: headings and paragraph starts stay visible
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/&#8220;|&ldquo;/g, '“').replace(/&#8221;|&rdquo;/g, '”').replace(/&[a-z#0-9]+;/gi, ' ')
}
