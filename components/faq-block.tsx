import type { FaqItem } from '@/lib/faq'

export function FaqBlock({ items, title = 'Frequently asked questions' }: { items: FaqItem[]; title?: string }) {
  return (
    <section className="faq-block">
      <h2>{title}</h2>
      <dl>
        {items.map((item) => (
          <div className="faq-item" key={item.question}>
            <dt>{item.question}</dt>
            <dd>{item.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
