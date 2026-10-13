//! Persisted DSP controls. Only numeric, validated values reach the filter graph.
use serde::{Deserialize, Serialize};

pub const FREQUENCIES: [u32; 10] = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Equalizer {
    pub enabled: bool,
    pub bands: [f64; 10],
    pub preamp: f64,
    pub bass: f64,
    pub treble: f64,
    pub stereo_width: f64,
    pub limiter: bool,
}

impl Default for Equalizer {
    fn default() -> Self {
        Self {
            enabled: false,
            bands: [0.0; 10],
            preamp: 0.0,
            bass: 0.0,
            treble: 0.0,
            stereo_width: 1.0,
            limiter: true,
        }
    }
}

impl Equalizer {
    pub fn validate(&self) -> Result<(), &'static str> {
        let range = |v: f64, lo: f64, hi: f64| v.is_finite() && (lo..=hi).contains(&v);
        if !self.bands.iter().all(|v| range(*v, -12.0, 12.0))
            || !range(self.bass, -12.0, 12.0)
            || !range(self.treble, -12.0, 12.0)
            || !range(self.preamp, -24.0, 12.0)
            || !range(self.stereo_width, 0.0, 2.0)
        {
            return Err("Equalizer values are outside their supported range");
        }
        Ok(())
    }

    /// One graph avoids rebuilding the audio between each individual band. Bass and treble
    /// are real shelf filters; stereo width changes the side signal without adding an echo.
    pub(crate) fn filter(&self) -> Option<String> {
        if !self.enabled {
            return None;
        }
        let mut filters = Vec::new();
        if self.preamp != 0.0 {
            filters.push(format!("volume={}dB", self.preamp));
        }
        for (frequency, gain) in FREQUENCIES.iter().zip(self.bands.iter()) {
            if *gain != 0.0 {
                filters.push(format!("equalizer=f={frequency}:t=o:w=1:g={gain}"));
            }
        }
        if self.bass != 0.0 {
            filters.push(format!("bass=g={}:f=110:t=s:w=0.7", self.bass));
        }
        if self.treble != 0.0 {
            filters.push(format!("treble=g={}:f=5000:t=s:w=0.7", self.treble));
        }
        if self.stereo_width != 1.0 {
            filters.push(format!("stereotools=slev={}", self.stereo_width));
        }
        if filters.is_empty() {
            return None;
        }
        if self.limiter {
            filters.push("alimiter=limit=1:level=disabled:latency=1".into());
        }
        Some(format!("lavfi=[{}]", filters.join(",")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bypass_and_flat_are_filterless() {
        assert_eq!(Equalizer::default().filter(), None);
        assert_eq!(Equalizer { enabled: true, ..Default::default() }.filter(), None);
    }
    #[test]
    fn boosts_and_modifiers_reach_the_graph() {
        let mut eq = Equalizer {
            enabled: true,
            bass: 6.0,
            treble: -2.0,
            preamp: -6.0,
            stereo_width: 0.5,
            ..Default::default()
        };
        eq.bands[2] = 3.0;
        let chain = eq.filter().unwrap();
        assert!(chain.contains("equalizer=f=125:t=o:w=1:g=3"));
        assert!(chain.contains("bass=g=6:f=110"));
        assert!(chain.contains("treble=g=-2:f=5000"));
        assert!(chain.contains("stereotools=slev=0.5"));
        assert!(chain.contains("volume=-6dB"));
        assert!(chain.ends_with("alimiter=limit=1:level=disabled:latency=1]"));
    }
    #[test]
    fn rejects_non_finite_and_out_of_range_values() {
        let mut eq = Equalizer::default();
        eq.bands[0] = f64::NAN;
        assert!(eq.validate().is_err());
        eq.bands[0] = 0.0;
        eq.stereo_width = 3.0;
        assert!(eq.validate().is_err());
        eq.stereo_width = 1.0;
        eq.bass = 13.0;
        assert!(eq.validate().is_err());
    }
}
