import {ArrowUpRight, Globe} from 'lucide-react';
import './website-analytics.css';

export default function WebsiteAnalytics() {
 return <section className="nxt-dashboard-card website-analytics" aria-labelledby="website-analytics-title">
  <header>
   <div><h2 id="website-analytics-title"><Globe size={18} aria-hidden="true"/>Website Analytics</h2><p>nxt-workforce.com · Google Analytics</p></div>
   <span className="website-analytics-status">Not connected to Business OS</span>
  </header>
  <dl className="website-analytics-metrics">
   {['Users','Sessions','Page views','Engagement rate'].map(label=><div key={label}><dt>{label}</dt><dd>Unavailable</dd></div>)}
  </dl>
  <div className="website-analytics-footer">
   <p>Website tracking and dashboard reporting are separate. Connect reporting access to show metrics here. No analytics data has been loaded into this dashboard.</p>
   <a href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer">Open Google Analytics <ArrowUpRight size={15} aria-hidden="true"/><span className="sr-only"> (opens in a new tab)</span></a>
  </div>
 </section>;
}
