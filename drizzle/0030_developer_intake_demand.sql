ALTER TABLE "developer_analytics_released" DROP CONSTRAINT "developer_analytics_released_dimension";--> statement-breakpoint
ALTER TABLE "developer_analytics_released" ADD CONSTRAINT "developer_analytics_released_dimension" CHECK (("developer_analytics_released"."dimension" = 'none' and "developer_analytics_released"."dimension_value" is null)
        or ("developer_analytics_released"."dimension" = 'device' and "developer_analytics_released"."dimension_value" in ('mobile', 'tablet', 'desktop'))
        or ("developer_analytics_released"."dimension" = 'budget_band' and "developer_analytics_released"."dimension_value" in ('Up to ₹50 lakh', '₹50–75 lakh', '₹75 lakh–1 crore', '₹1–1.5 crore', '₹1.5–2 crore', '₹2–3 crore', '₹3–5 crore', '₹5 crore or more'))
        or ("developer_analytics_released"."dimension" = 'intake_bhk' and "developer_analytics_released"."dimension_value" ~ '^[a-z0-9_]{1,40}$')
        or ("developer_analytics_released"."dimension" = 'intake_city' and length("developer_analytics_released"."dimension_value") between 1 and 60
          and "developer_analytics_released"."dimension_value" !~ '[[:cntrl:]]'));