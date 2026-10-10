// Arrow-key support for custom role="radio" groups. Attach it to the role="radiogroup" element.
// Arrow keys move to the next or previous enabled radio, Home and End jump to the ends, and, as in
// the ARIA radio pattern, selection follows focus. Give the checked radio tabIndex 0 and the others
// -1, so Tab enters and leaves the group as a single stop.
export function onRadioGroupKeyDown(event) {
  const { key, target, currentTarget } = event
  if (!(target instanceof HTMLElement) || target.getAttribute("role") !== "radio") return

  const next = key === "ArrowRight" || key === "ArrowDown"
  const prev = key === "ArrowLeft" || key === "ArrowUp"
  if (!next && !prev && key !== "Home" && key !== "End") return

  const radios = Array.from(currentTarget.querySelectorAll('[role="radio"]')).filter((el) => !el.disabled)
  const index = radios.indexOf(target)
  if (index === -1) return

  let target_i = index
  if (key === "Home") target_i = 0
  else if (key === "End") target_i = radios.length - 1
  else if (next) target_i = (index + 1) % radios.length
  else target_i = (index - 1 + radios.length) % radios.length

  event.preventDefault()
  radios[target_i].focus()
  radios[target_i].click()
}