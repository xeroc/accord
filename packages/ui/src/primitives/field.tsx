import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../internal/cn"
import { Label } from "./label"

/**
 * Field — the form-field anatomy (label + control + description + error).
 *
 * Apps never hand-roll `<label className="font-mono …">` blocks: FieldLabel
 * carries the Accord label style, and FieldControl wires the generated id /
 * aria-describedby / aria-invalid onto any single control element:
 *
 *   <Field invalid={!!error}>
 *     <FieldLabel>Title</FieldLabel>
 *     <FieldControl>
 *       <Input />
 *     </FieldControl>
 *     <FieldDescription>Optional help text.</FieldDescription>
 *     <FieldError>{error}</FieldError>
 *   </Field>
 *
 * FieldControl takes exactly one child (like asChild) and clones it with the
 * wiring, so Input/Textarea/SelectTrigger keep their own props. Components
 * rendered INSIDE a Field can also read the same state via useField().
 * FieldError renders nothing without content, so both description/error ids
 * can stay referenced from aria-describedby (unresolved idrefs are ignored).
 */
type FieldControlProps = {
  id?: string
  "aria-describedby"?: string
  "aria-invalid"?: true
}

type FieldContextValue = {
  id: string
  invalid: boolean
  describedBy?: string
  controlProps: FieldControlProps
}

const FieldContext = React.createContext<FieldContextValue>({
  id: "",
  invalid: false,
  describedBy: undefined,
  controlProps: {},
})

/** Field state for the control. Outside a Field it degrades to a no-op. */
function useField(): FieldContextValue {
  return React.useContext(FieldContext)
}

/** Clones its single control child with the field's id/aria wiring. */
function FieldControl({
  children,
}: {
  children: React.ReactElement
}) {
  const field = useField()
  return React.cloneElement(children, field.controlProps)
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        "group/field-group flex w-full flex-col gap-5 *:data-[slot=field-group]:gap-4",
        className
      )}
      {...props}
    />
  )
}

const fieldVariants = cva(
  "group/field flex w-full gap-2 data-[invalid=true]:text-destructive",
  {
    variants: {
      orientation: {
        vertical: "flex-col *:w-full [&>.sr-only]:w-auto",
        horizontal:
          "flex-row items-center *:data-[slot=field-label]:flex-auto",
      },
    },
    defaultVariants: {
      orientation: "vertical",
    },
  }
)

function Field({
  className,
  orientation = "vertical",
  invalid = false,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof fieldVariants> & {
    /** Drives aria-invalid on the control and data-invalid styling here. */
    invalid?: boolean
  }) {
  // React 18 useId() yields ":r0:"-style values; strip to [a-zA-Z0-9-] so
  // CSS-selector-based a11y tooling (axe's label[for] lookup) associates
  // label and control. Colon positions are a fixed prefix/suffix, so
  // stripping preserves useId's uniqueness guarantee.
  const id = React.useId().replace(/[^a-zA-Z0-9-]/g, "")
  const describedBy = `${id}-description ${id}-error`
  const context = React.useMemo<FieldContextValue>(
    () => ({
      id,
      invalid,
      describedBy,
      controlProps: {
        id,
        "aria-describedby": describedBy,
        ...(invalid ? { "aria-invalid": true as const } : {}),
      },
    }),
    [id, invalid]
  )

  return (
    <FieldContext.Provider value={context}>
      <div
        role="group"
        data-slot="field"
        data-orientation={orientation}
        data-invalid={invalid || undefined}
        className={cn(fieldVariants({ orientation }), className)}
        {...props}
      />
    </FieldContext.Provider>
  )
}

function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>) {
  const field = useField()

  return (
    <Label
      data-slot="field-label"
      htmlFor={field.id || undefined}
      className={cn(
        "font-mono font-normal text-text-secondary",
        className
      )}
      {...props}
    />
  )
}

function FieldDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  const field = useField()

  return (
    <p
      data-slot="field-description"
      id={field.id ? `${field.id}-description` : undefined}
      className={cn(
        "text-left text-xs leading-normal font-normal text-muted-foreground",
        "[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        className
      )}
      {...props}
    />
  )
}

function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<"div"> & {
  /** react-hook-form style error objects; children win when both are set. */
  errors?: Array<{ message?: string } | undefined>
}) {
  const field = useField()
  const content = React.useMemo(() => {
    if (children) {
      return children
    }

    if (!errors?.length) {
      return null
    }

    const uniqueErrors = [
      ...new Map(errors.map((error) => [error?.message, error])).values(),
    ]

    if (uniqueErrors?.length == 1) {
      return uniqueErrors[0]?.message
    }

    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {uniqueErrors.map(
          (error, index) =>
            error?.message && <li key={index}>{error.message}</li>
        )}
      </ul>
    )
  }, [children, errors])

  if (!content) {
    return null
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      id={field.id ? `${field.id}-error` : undefined}
      className={cn("text-sm font-normal text-destructive", className)}
      {...props}
    >
      {content}
    </div>
  )
}

export {
  Field,
  FieldControl,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  useField,
}
