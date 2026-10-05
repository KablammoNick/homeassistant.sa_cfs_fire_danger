DOMAIN = "sa_cfs_fire_danger"
CONF_DISTRICTS = "districts"
XML_URL = "https://data.eso.sa.gov.au/prod/cfs/criimson/fireDangerRating.xml"

# Fire danger "days" follow South Australian local time, regardless of HA's timezone.
SA_TIMEZONE = "Australia/Adelaide"

MAX_FORECAST_DAYS = 5

# AFDRS ratings, lowest to highest. The index is the numeric "level".
RATINGS = ["No Rating", "Moderate", "High", "Extreme", "Catastrophic"]
