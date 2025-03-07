import { FormKitExtendableSchemaRoot } from '@formkit/core'
import label from '../composables/label'
import outer from '../composables/outer'
import wrapper from '../composables/wrapper'
import inner from '../composables/inner'
import text from '../composables/text'
import help from '../composables/help'
import prefix from '../composables/prefix'
import suffix from '../composables/suffix'
import messages from '../composables/messages'
import message from '../composables/message'

/**
 * The schema for text classifications.
 * @public
 */
const textSchema: FormKitExtendableSchemaRoot = (extensions = {}) => [
  outer(extensions.outer, [
    wrapper(extensions.wrapper, [
      label(extensions.label, '$label'),
      inner(extensions.inner, [
        prefix(extensions.prefix),
        text(extensions.input),
        suffix(extensions.suffix),
      ]),
    ]),
    help(extensions.help, '$help'),
    messages(extensions.messages, [
      message(extensions.message, '$message.value'),
    ]),
  ]),
]

export default textSchema
