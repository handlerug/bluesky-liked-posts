import { memo } from 'react'
import { RichText as RichTextParser } from '@atproto/api'
import { WEB_APP } from '../utils/constants'

const RichText = memo(
  ({
    text,
    facets,
  }: {
    text: string
    facets?: AppBskyRichtextFacet.Main[]
  }) => {
    const rt = new RichTextParser({ text, facets })
    const nodes: ReactNode[] = []
    let key = 0
    for (const segment of rt.segments()) {
      if (segment.isLink()) {
        nodes.push(
          <a key={key++} href={segment.link?.uri}>
            {segment.text}
          </a>
        )
      } else if (segment.isMention()) {
        nodes.push(
          <a key={key++} href={`${WEB_APP}/profile/${segment.mention?.did}`}>
            {segment.text}
          </a>
        )
      } else {
        const runs = segment.text.split('\n')
        for (let i = 0; i < runs.length; i++) {
          if (i > 0) {
            nodes.push(<br key={key++} />)
          }
          nodes.push(runs[i])
        }
      }
    }
    return <>{nodes}</>
  }
)

export default RichText
